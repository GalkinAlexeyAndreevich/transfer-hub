import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { LightMyRequestResponse } from 'fastify';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import { AppModule } from '@/app.module';
import databaseConfig from '@/config/database.config';
import { DatabaseService } from '@/database/database.service';
import type { Database } from '@/database/database.types';
import * as createUsers from '@/database/migrations/001_create_users';
import * as createRefreshTokens from '@/database/migrations/002_create_refresh_tokens';
import * as addDeletedAt from '@/database/migrations/003_add_users_deleted_at';
import * as addAgeDescription from '@/database/migrations/004_users_age_description';
import * as addRefreshSessionId from '@/database/migrations/005_add_refresh_session_id';
import * as usersActiveUniqueIndexes from '@/database/migrations/006_users_active_unique_indexes';
import * as addRefreshTokensUserFk from '@/database/migrations/007_add_refresh_tokens_user_fk';
import * as createAvatars from '@/database/migrations/008_create_avatars';
import type { TokenPair } from '@/modules/auth/auth.service';
import { hashToken } from '@/modules/auth/helpers/hash-token';
import { RefreshTokensRepository } from '@/modules/sessions/refresh-tokens.repository';
import { UsersRepository } from '@/modules/users/users.repository';
import { AvatarsRepository } from '@/modules/avatars/avatars.repository';
import { REFRESH_TOKEN_COOKIE } from '@/modules/auth/constants/auth.constants';
import { FilesService } from '@/providers/files/files.service';
import { AvatarFilePipe } from '@/modules/avatars/pipes/avatar-file.pipe';
import { MAX_AVATAR_SIZE } from '@/modules/avatars/constants/avatar.constants';

type Avatar = {
  id: number;
  avatarKey: string;
  uploadedAt: string;
};

type PublicUser = {
  id: number;
  login: string;
  age: number;
  description: string | null;
  avatars: Avatar[];
};

type UserProfile = PublicUser & { email: string };

function gate() {
  let resolve = () => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

describe('Auth and users (PostgreSQL)', () => {
  const schema = `test_auth_${randomUUID().replaceAll('-', '')}`;
  const legacyHash = 'a'.repeat(64);
  let app: NestFastifyApplication;
  let database: Kysely<Database>;
  let admin: Kysely<Database>;
  let legacyUserId: number;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useFactory({
        inject: [databaseConfig.KEY],
        factory: async (config: ConfigType<typeof databaseConfig>) => {
          admin = new Kysely<Database>({
            dialect: new PostgresDialect({
              pool: new Pool({ connectionString: config.url }),
            }),
          });
          await admin.schema.createSchema(schema).execute();

          const url = new URL(config.url);
          url.searchParams.set('options', `-c search_path=${schema}`);
          database = new Kysely<Database>({
            dialect: new PostgresDialect({
              pool: new Pool({ connectionString: url.toString() }),
            }),
          });

          const migrator = new Migrator({
            db: database,
            migrationTableSchema: schema,
            provider: {
              getMigrations: () =>
                Promise.resolve({
                  '001_create_users': createUsers,
                  '002_create_refresh_tokens': createRefreshTokens,
                  '003_add_users_deleted_at': addDeletedAt,
                  '004_users_age_description': addAgeDescription,
                  '005_add_refresh_session_id': addRefreshSessionId,
                  '006_users_active_unique_indexes': usersActiveUniqueIndexes,
                  '007_add_refresh_tokens_user_fk': addRefreshTokensUserFk,
                  '008_create_avatars': createAvatars,
                }),
            },
          });
          const initial = await migrator.migrateTo('004_users_age_description');
          if (initial.error) {
            throw new Error('Не удалось подготовить схему тестов', {
              cause: initial.error,
            });
          }

          const legacyUser = await database
            .insertInto('users')
            .values({
              login: 'legacy',
              email: 'legacy@example.com',
              password_hash: 'unused-test-hash',
              age: 25,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          legacyUserId = legacyUser.id;
          await sql`
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES (${legacyUserId}, ${legacyHash}, now() + interval '1 day')
          `.execute(database);

          const migrated = await migrator.migrateToLatest();
          if (migrated.error) {
            throw new Error('Не удалось применить миграции к тестовой схеме', {
              cause: migrated.error,
            });
          }

          return { db: database };
        },
      })
      .compile();

    const adapter = new FastifyAdapter();
    app = module.createNestApplication<NestFastifyApplication>(adapter, {
      logger: false,
    });
    await app.register(cookie);
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    await adapter.getInstance().ready();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (database) await database.destroy();
      } finally {
        if (admin) {
          try {
            await admin.schema
              .dropSchema(schema)
              .ifExists()
              .cascade()
              .execute();
          } finally {
            await admin.destroy();
          }
        }
      }
    }
  });

  async function register() {
    const login = `u-${randomUUID()}`;
    const user = {
      login,
      email: `${login}@example.com`,
      password: 'ExamplePassword123!',
      age: 25,
    };
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: user,
    });
    expect(response.statusCode).toBe(201);

    return { user, tokens: readTokens(response) };
  }

  function readTokens(response: LightMyRequestResponse): TokenPair {
    const tokens = response.json<{ access_token: string }>();
    expect(Object.keys(tokens)).toEqual(['access_token']);
    expect(typeof tokens.access_token).toBe('string');
    const refreshCookie = response.cookies.find(
      (cookie) => cookie.name === REFRESH_TOKEN_COOKIE,
    );
    expect(refreshCookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/auth',
    });
    expect(refreshCookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(refreshCookie?.expires).toBeInstanceOf(Date);

    return { ...tokens, refresh_token: refreshCookie!.value };
  }

  describe('Аватары', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7p8AAAAASUVORK5CYII=',
      'base64',
    );
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAf/2Q==',
      'base64',
    );
    let owner: Awaited<ReturnType<typeof register>>;
    let userId: number;
    let objects: Map<string, Buffer>;
    let upload: jest.SpyInstance<Promise<void>, [string, Buffer, string]>;

    beforeEach(async () => {
      owner = await register();
      const user = await database
        .selectFrom('users')
        .select('id')
        .where('login', '=', owner.user.login)
        .executeTakeFirstOrThrow();
      userId = user.id;
      objects = new Map();
      upload = jest
        .spyOn(app.get(FilesService), 'upload')
        .mockImplementation((key, body) => {
          objects.set(key, body);
          return Promise.resolve();
        });
      jest.spyOn(app.get(FilesService), 'remove').mockImplementation((key) => {
        objects.delete(key);
        return Promise.resolve();
      });
    });

    function uploadAvatar(
      buffer: Buffer,
      options: {
        authenticated?: boolean;
        copies?: number;
        filename?: string;
        contentType?: string;
      } = {},
    ) {
      const boundary = `avatar-${randomUUID()}`;
      const part = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename ?? 'untrusted.txt'}"\r\nContent-Type: ${options.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
        buffer,
        Buffer.from('\r\n'),
      ]);
      const payload = Buffer.concat([
        ...Array.from({ length: options.copies ?? 1 }, () => part),
        Buffer.from(`--${boundary}--\r\n`),
      ]);

      return app.inject({
        method: 'POST',
        url: '/users/me/avatar',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          ...(options.authenticated === false
            ? {}
            : { authorization: `Bearer ${owner.tokens.access_token}` }),
        },
        payload,
      });
    }

    function storedAvatars() {
      return database
        .selectFrom('avatars')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('id', 'asc')
        .execute();
    }

    function removeAvatar(
      avatarId: number,
      accessToken = owner.tokens.access_token,
    ) {
      return app.inject({
        method: 'DELETE',
        url: `/users/me/avatars/${avatarId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
    }

    it.each([
      { format: 'PNG', data: png, contentType: 'image/png', extension: 'png' },
      {
        format: 'JPEG',
        data: jpeg,
        contentType: 'image/jpeg',
        extension: 'jpg',
      },
    ])(
      'определяет $format по содержимому и сохраняет ключ',
      async ({ data, contentType, extension }) => {
        const response = await uploadAvatar(data);
        expect(response.statusCode).toBe(201);
        const avatar = response.json<Avatar>();
        const uploadedAt = new Date(avatar.uploadedAt);
        expect(avatar.uploadedAt).toBe(uploadedAt.toISOString());
        expect(avatar.avatarKey).toMatch(
          new RegExp(`^avatars/${userId}/[\\da-f-]+\\.${extension}$`),
        );
        expect(await storedAvatars()).toEqual([
          {
            id: avatar.id,
            user_id: userId,
            object_key: avatar.avatarKey,
            uploaded_at: uploadedAt,
            deleted_at: null,
          },
        ]);
        expect(upload).toHaveBeenCalledWith(
          avatar.avatarKey,
          data,
          contentType,
        );
        const profile = await app.inject({
          method: 'GET',
          url: '/users/me',
          headers: { authorization: `Bearer ${owner.tokens.access_token}` },
        });
        expect(profile.json<UserProfile>().avatars).toEqual([avatar]);
        const user = await app.get(UsersRepository).findProfile(userId);
        expect(user?.avatars).toEqual([{ ...avatar, uploadedAt }]);
      },
    );

    it('отклоняет текстовый файл', async () => {
      const response = await uploadAvatar(Buffer.from('not an image'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });
      expect(response.statusCode).toBe(400);
      expect(upload).not.toHaveBeenCalled();
      expect(await storedAvatars()).toEqual([]);
    });

    it('принимает ровно 10 МиБ', async () => {
      const data = Buffer.alloc(MAX_AVATAR_SIZE);
      png.copy(data);
      const response = await uploadAvatar(data);
      expect(response.statusCode).toBe(201);
    });

    it('отклоняет файл больше 10 МиБ до pipe и обращения к хранилищу', async () => {
      const pipe = jest.spyOn(AvatarFilePipe.prototype, 'transform');
      const response = await uploadAvatar(Buffer.alloc(MAX_AVATAR_SIZE + 1));
      expect(response.statusCode).toBe(413);
      expect(pipe).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      expect(await storedAvatars()).toEqual([]);
    });

    it('требует файл и запрещает несколько файлов', async () => {
      const missing = await uploadAvatar(png, { copies: 0 });
      const multiple = await uploadAvatar(png, { copies: 2 });
      expect(missing.statusCode).toBe(400);
      expect(multiple.statusCode).toBe(400);
      expect(upload).not.toHaveBeenCalled();
    });

    it('требует авторизацию', async () => {
      const response = await uploadAvatar(png, { authenticated: false });
      expect(response.statusCode).toBe(401);
      expect(upload).not.toHaveBeenCalled();
    });

    it('сохраняет ранее загруженные аватары при сбое хранилища', async () => {
      const first = await uploadAvatar(png);
      const { avatarKey } = first.json<Avatar>();
      upload.mockRejectedValueOnce(new Error('Storage failure'));
      const response = await uploadAvatar(jpeg);
      expect(response.statusCode).toBe(503);
      expect(
        (await storedAvatars()).map((avatar) => avatar.object_key),
      ).toEqual([avatarKey]);
      expect([...objects.keys()]).toEqual([avatarKey]);
    });

    it('очищает новую загрузку и откатывает изменение при ошибке БД', async () => {
      const first = await uploadAvatar(png);
      const { avatarKey } = first.json<Avatar>();
      jest
        .spyOn(app.get(AvatarsRepository), 'create')
        .mockRejectedValueOnce(new Error('Database failure'));
      const response = await uploadAvatar(jpeg);
      expect(response.statusCode).toBe(500);
      expect(
        (await storedAvatars()).map((avatar) => avatar.object_key),
      ).toEqual([avatarKey]);
      expect([...objects.keys()]).toEqual([avatarKey]);
    });

    it('ограничивает число активных аватаров при параллельных загрузках', async () => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => uploadAvatar(png)),
      );
      expect(responses.map((response) => response.statusCode).sort()).toEqual([
        201, 201, 201, 201, 201, 409,
      ]);
      const keys = responses
        .filter((response) => response.statusCode === 201)
        .map((response) => response.json<Avatar>().avatarKey)
        .sort();
      expect(
        (await storedAvatars()).map((avatar) => avatar.object_key).sort(),
      ).toEqual(keys);
      expect([...objects.keys()].sort()).toEqual(keys);
      upload.mockClear();
      expect((await uploadAvatar(jpeg)).statusCode).toBe(409);
      expect(upload).not.toHaveBeenCalled();
    });

    it('разрешает только владельцу удалить аватар и освобождает место для загрузки', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => uploadAvatar(png)),
      );
      expect(responses.map((response) => response.statusCode)).toEqual(
        Array(5).fill(201),
      );
      const avatar = responses[0].json<Avatar>();
      const otherUser = await register();

      expect(
        (await removeAvatar(avatar.id, otherUser.tokens.access_token))
          .statusCode,
      ).toBe(404);
      expect(
        (await storedAvatars()).find(({ id }) => id === avatar.id)?.deleted_at,
      ).toBeNull();
      expect((await removeAvatar(avatar.id)).statusCode).toBe(204);
      expect((await removeAvatar(avatar.id)).statusCode).toBe(404);
      const replacement = await uploadAvatar(jpeg);
      expect(replacement.statusCode).toBe(201);

      const rows = await storedAvatars();
      expect(rows).toHaveLength(6);
      expect(
        rows.find(({ id }) => id === avatar.id)?.deleted_at,
      ).toBeInstanceOf(Date);
      expect(rows.filter(({ deleted_at }) => deleted_at === null)).toHaveLength(
        5,
      );
      expect(objects.has(avatar.avatarKey)).toBe(true);

      const list = await app.inject({
        method: 'GET',
        url: '/users',
        query: { login: owner.user.login },
        headers: { authorization: `Bearer ${owner.tokens.access_token}` },
      });
      const [user] = list.json<{ items: PublicUser[] }>().items;
      expect(user.avatars).toHaveLength(5);
      expect(user.avatars[0]).toEqual(replacement.json<Avatar>());
      expect(user.avatars).not.toContainEqual(avatar);
    });
  });

  function refresh(token: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/refresh-token',
      cookies: { [REFRESH_TOKEN_COOKIE]: token },
    });
  }

  function logout(token: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [REFRESH_TOKEN_COOKIE]: token },
    });
  }

  it('не создаёт сессию при входе с неверным паролем', async () => {
    const { user } = await register();
    const storedUser = await database
      .selectFrom('users')
      .select('id')
      .where('login', '=', user.login)
      .executeTakeFirstOrThrow();
    const findSessions = () =>
      database
        .selectFrom('refresh_tokens')
        .selectAll()
        .where('user_id', '=', storedUser.id)
        .orderBy('session_id')
        .execute();
    const before = await findSessions();
    expect(before).toHaveLength(1);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: 'WrongPassword123!' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ message: string[] }>().message).toEqual([
      'Неверный логин или пароль',
    ]);
    expect(await findSessions()).toEqual(before);
  });

  it.each(['login', 'email'] as const)(
    'возвращает 409 при обновлении на занятый %s и сохраняет исходные данные',
    async (field) => {
      const owner = await register();
      const occupied = await register();
      const before = await database
        .selectFrom('users')
        .selectAll()
        .where('login', '=', owner.user.login)
        .executeTakeFirstOrThrow();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${before.id}`,
        headers: { authorization: `Bearer ${owner.tokens.access_token}` },
        payload: { [field]: occupied.user[field], age: 30 },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json<{ message: string[] }>().message).toEqual([
        'Пользователь с таким email или login уже существует',
      ]);
      const after = await database
        .selectFrom('users')
        .selectAll()
        .where('id', '=', before.id)
        .executeTakeFirstOrThrow();
      expect(after).toEqual(before);
    },
  );

  it('soft delete скрывает пользователя и отзывает все его сессии', async () => {
    const { user, tokens } = await register();
    const observer = await register();
    const observerHeaders = {
      authorization: `Bearer ${observer.tokens.access_token}`,
    };
    const storedUser = await database
      .selectFrom('users')
      .select('id')
      .where('login', '=', user.login)
      .executeTakeFirstOrThrow();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: user.password },
    });
    expect(login.statusCode).toBe(201);
    const anotherSession = readTokens(login);
    const findSessions = () =>
      database
        .selectFrom('refresh_tokens')
        .select('session_id')
        .where('user_id', '=', storedUser.id)
        .execute();
    expect(await findSessions()).toHaveLength(2);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/users/${storedUser.id}`,
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(removed.statusCode).toBe(200);
    const deleted = await database
      .selectFrom('users')
      .select('deleted_at')
      .where('id', '=', storedUser.id)
      .executeTakeFirstOrThrow();
    expect(deleted.deleted_at).toBeInstanceOf(Date);
    expect(await findSessions()).toEqual([]);

    const profile = await app.inject({
      method: 'GET',
      url: `/users/${storedUser.id}`,
      headers: observerHeaders,
    });
    expect(profile.statusCode).toBe(404);
    expect(profile.json<{ message: string[] }>().message).toEqual([
      'Пользователь не найден',
    ]);
    const list = await app.inject({
      method: 'GET',
      url: '/users',
      query: { login: user.login },
      headers: observerHeaders,
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json<{ items: PublicUser[]; meta: { total: number } }>(),
    ).toMatchObject({
      items: [],
      meta: { total: 0 },
    });

    for (const session of [tokens, anotherSession]) {
      const me = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      expect(me.statusCode).toBe(401);
      expect(me.json<{ message: string[] }>().message).toEqual([
        'Пользователь не найден',
      ]);
      expect((await refresh(session.refresh_token)).statusCode).toBe(401);
    }
    const relogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: user.password },
    });
    expect(relogin.statusCode).toBe(401);
    expect(await findSessions()).toEqual([]);
    expect((await refresh(observer.tokens.refresh_token)).statusCode).toBe(201);
  });

  it('откатывает soft delete и отзыв сессий при ошибке транзакции', async () => {
    const { user, tokens } = await register();
    const storedUser = await database
      .selectFrom('users')
      .selectAll()
      .where('login', '=', user.login)
      .executeTakeFirstOrThrow();
    const findSessions = () =>
      database
        .selectFrom('refresh_tokens')
        .selectAll()
        .where('user_id', '=', storedUser.id)
        .execute();
    const sessions = await findSessions();
    expect(sessions).toHaveLength(1);
    const repository = app.get(RefreshTokensRepository);
    const databaseRepository = new RefreshTokensRepository(
      app.get<DatabaseService>(DatabaseService),
    );
    jest
      .spyOn(repository, 'removeAllForUser')
      .mockImplementationOnce(async (userId, trx) => {
        await databaseRepository.removeAllForUser(userId, trx);
        throw new Error('Ошибка после отзыва сессий');
      });

    const response = await app.inject({
      method: 'DELETE',
      url: `/users/${storedUser.id}`,
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });

    expect(response.statusCode).toBe(500);
    expect(
      await database
        .selectFrom('users')
        .selectAll()
        .where('id', '=', storedUser.id)
        .executeTakeFirstOrThrow(),
    ).toEqual(storedUser);
    expect(await findSessions()).toEqual(sessions);
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(201);
  });

  async function startPausedLogin(checkpoint: 'before-lock' | 'after-lock') {
    const { user, tokens } = await register();
    const storedUser = await database
      .selectFrom('users')
      .select('id')
      .where('login', '=', user.login)
      .executeTakeFirstOrThrow();
    const repository = app.get(UsersRepository);
    const databaseRepository = new UsersRepository(
      app.get<DatabaseService>(DatabaseService),
    );
    const paused = gate();
    const release = gate();
    const pauseLogin = async () => {
      paused.resolve();
      await release.promise;
    };
    jest
      .spyOn(repository, 'findOneForUpdate')
      .mockImplementationOnce(async (id, trx) => {
        if (checkpoint === 'before-lock') {
          await pauseLogin();
        }

        const result = await databaseRepository.findOneForUpdate(id, trx);

        if (checkpoint === 'after-lock') {
          await pauseLogin();
        }

        return result;
      });

    const pendingLogin = app
      .inject({
        method: 'POST',
        url: '/auth/login',
        payload: { login: user.login, password: user.password },
      })
      .then((response) => response);

    return {
      pendingLogin,
      userId: storedUser.id,
      waitForPause: () =>
        Promise.race([
          paused.promise,
          pendingLogin.then(() => {
            throw new Error('Вход завершился до контрольной точки');
          }),
        ]),
      resumeLogin: release.resolve,
      startDeletion: () =>
        app
          .inject({
            method: 'DELETE',
            url: `/users/${storedUser.id}`,
            headers: { authorization: `Bearer ${tokens.access_token}` },
          })
          .then((response) => response),
      findSessions: () =>
        database
          .selectFrom('refresh_tokens')
          .selectAll()
          .where('user_id', '=', storedUser.id)
          .execute(),
    };
  }

  it('не создаёт сессию при удалении пользователя до блокировки при входе', async () => {
    const login = await startPausedLogin('before-lock');
    try {
      await login.waitForPause();
      expect((await login.startDeletion()).statusCode).toBe(200);
    } finally {
      login.resumeLogin();
    }

    expect((await login.pendingLogin).statusCode).toBe(401);
    expect(await login.findSessions()).toEqual([]);
  });

  it('отзывает сессию при удалении пользователя после блокировки при входе', async () => {
    const login = await startPausedLogin('after-lock');
    let pendingDeletion: Promise<LightMyRequestResponse>;
    try {
      await login.waitForPause();
      await expect(
        database
          .transaction()
          .execute((trx) =>
            trx
              .selectFrom('users')
              .select('id')
              .where('id', '=', login.userId)
              .forUpdate()
              .noWait()
              .execute(),
          ),
      ).rejects.toMatchObject({ code: '55P03' });
      pendingDeletion = login.startDeletion();
    } finally {
      login.resumeLogin();
    }

    const [response, deletion] = await Promise.all([
      login.pendingLogin,
      pendingDeletion,
    ]);
    expect(response.statusCode).toBe(201);
    expect(deletion.statusCode).toBe(200);
    expect(await login.findSessions()).toEqual([]);
    const { refresh_token: refreshToken } = readTokens(response);
    expect((await refresh(refreshToken)).statusCode).toBe(401);
  });

  it('отклоняет сессию с несуществующим user_id на уровне БД', async () => {
    await expect(
      database
        .insertInto('refresh_tokens')
        .values({
          session_id: randomUUID(),
          token_hash: hashToken(randomUUID()),
          user_id: -1,
          expires_at: new Date(Date.now() + 60_000),
        })
        .execute(),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'refresh_tokens_user_id_fkey',
    });
  });

  it('каскадно удаляет сессии при физическом удалении пользователя', async () => {
    const { user } = await register();
    const storedUser = await database
      .selectFrom('users')
      .select('id')
      .where('login', '=', user.login)
      .executeTakeFirstOrThrow();
    const findSessions = () =>
      database
        .selectFrom('refresh_tokens')
        .select('session_id')
        .where('user_id', '=', storedUser.id)
        .execute();

    expect(await findSessions()).toHaveLength(1);

    await database
      .deleteFrom('users')
      .where('id', '=', storedUser.id)
      .execute();

    expect(await findSessions()).toEqual([]);
  });

  it.each(['login', 'email', 'login и email'])(
    'позволяет повторно использовать %s после soft delete, сохраняя уникальность активных',
    async (field) => {
      const { user, tokens } = await register();
      const replacement = {
        ...user,
        login: field === 'email' ? `u-${randomUUID()}` : user.login,
        email: field === 'login' ? `${randomUUID()}@example.com` : user.email,
      };
      const registerReplacement = () =>
        app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: replacement,
        });

      expect((await registerReplacement()).statusCode).toBe(409);

      const original = await database
        .selectFrom('users')
        .select('id')
        .where('login', '=', user.login)
        .executeTakeFirstOrThrow();
      const removed = await app.inject({
        method: 'DELETE',
        url: `/users/${original.id}`,
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      expect(removed.statusCode).toBe(200);

      const deleted = await database
        .selectFrom('users')
        .select('deleted_at')
        .where('id', '=', original.id)
        .executeTakeFirstOrThrow();
      expect(deleted.deleted_at).toBeInstanceOf(Date);

      expect((await registerReplacement()).statusCode).toBe(201);
      expect((await registerReplacement()).statusCode).toBe(409);
    },
  );

  it('миграция отзывает старые refresh и сохраняет пользователей', async () => {
    const user = await database
      .selectFrom('users')
      .select('id')
      .where('id', '=', legacyUserId)
      .executeTakeFirst();
    const token = await database
      .selectFrom('refresh_tokens')
      .select('token_hash')
      .where('token_hash', '=', legacyHash)
      .executeTakeFirst();

    expect(user).toEqual({ id: legacyUserId });
    expect(token).toBeUndefined();
  });

  it('ротирует одноразовый refresh в пределах одного sid и хранит хеш', async () => {
    const { tokens } = await register();
    const initial = await database
      .selectFrom('refresh_tokens')
      .select('session_id')
      .where('token_hash', '=', hashToken(tokens.refresh_token))
      .executeTakeFirstOrThrow();
    const response = await refresh(tokens.refresh_token);
    expect(response.statusCode).toBe(201);
    const rotated = readTokens(response);
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(401);

    const stored = await database
      .selectFrom('refresh_tokens')
      .select(['token_hash', 'expires_at'])
      .where('session_id', '=', initial.session_id)
      .executeTakeFirstOrThrow();
    expect(stored.token_hash).toBe(hashToken(rotated.refresh_token));
    expect(stored.token_hash).not.toBe(rotated.refresh_token);
    expect(response.cookies[0].expires).toEqual(stored.expires_at);
  });

  it.each(['refresh-token', 'logout'])(
    'читает refresh для %s из cookie и отклоняет токен только в теле',
    async (route) => {
      const { tokens } = await register();
      const response = await app.inject({
        method: 'POST',
        url: `/auth/${route}`,
        payload: { refresh_token: tokens.refresh_token },
      });

      expect(response.statusCode).toBe(401);
      expect((await refresh(tokens.refresh_token)).statusCode).toBe(201);
    },
  );

  it('проверяет срок refresh в БД', async () => {
    const { tokens } = await register();
    await database
      .updateTable('refresh_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('token_hash', '=', hashToken(tokens.refresh_token))
      .execute();

    expect((await refresh(tokens.refresh_token)).statusCode).toBe(401);
    expect((await logout(tokens.refresh_token)).statusCode).toBe(401);
  });

  it('отклоняет неизвестный refresh и access вместо refresh', async () => {
    const { tokens } = await register();

    expect((await refresh(randomUUID())).statusCode).toBe(401);
    expect((await refresh(tokens.access_token)).statusCode).toBe(401);
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(201);
  });

  it('позволяет только один из двух одновременных refresh', async () => {
    const { tokens } = await register();
    const results = await Promise.all([
      refresh(tokens.refresh_token),
      refresh(tokens.refresh_token),
    ]);

    expect(results.map((response) => response.statusCode).sort()).toEqual([
      201, 401,
    ]);
  });

  it('logout отзывает ротированную сессию, найденную до замены хеша', async () => {
    const { tokens } = await register();
    const repository = app.get(RefreshTokensRepository);
    const databaseRepository = new RefreshTokensRepository(
      app.get<DatabaseService>(DatabaseService),
    );
    const found = gate();
    const release = gate();
    jest
      .spyOn(repository, 'findActiveByHash')
      .mockImplementationOnce(async (tokenHash) => {
        const result = await databaseRepository.findActiveByHash(tokenHash);
        found.resolve();
        await release.promise;
        return result;
      });

    const pending = logout(tokens.refresh_token);
    let rotated: TokenPair;
    try {
      await Promise.race([
        found.promise,
        pending.then(() => {
          throw new Error('Logout завершился до контрольной точки');
        }),
      ]);
      const response = await refresh(tokens.refresh_token);
      expect(response.statusCode).toBe(201);
      rotated = readTokens(response);
    } finally {
      release.resolve();
    }

    const response = await pending;
    expect(response.statusCode).toBe(200);
    expect((await refresh(rotated.refresh_token)).statusCode).toBe(401);
  });

  it('не обновляет токены, если logout завершился раньше refresh', async () => {
    const { tokens } = await register();

    const response = await logout(tokens.refresh_token);
    expect(response.statusCode).toBe(200);
    expect(response.cookies).toContainEqual(
      expect.objectContaining({
        name: REFRESH_TOKEN_COOKIE,
        value: '',
        path: '/auth',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        expires: new Date(0),
      }),
    );
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(401);
    expect((await logout(tokens.refresh_token)).statusCode).toBe(401);
  });

  it('отзывает только выбранную сессию пользователя', async () => {
    const { user, tokens } = await register();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: user.password },
    });
    expect(login.statusCode).toBe(201);
    const anotherSession = readTokens(login);

    expect((await logout(tokens.refresh_token)).statusCode).toBe(200);
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(401);
    expect((await refresh(anotherSession.refresh_token)).statusCode).toBe(201);
  });

  it('не использует access для logout', async () => {
    const { tokens } = await register();

    expect((await logout(tokens.access_token)).statusCode).toBe(401);
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(201);
  });

  it('возвращает email только в собственном профиле', async () => {
    const alice = await register();
    const bob = await register();
    const aliceHeaders = {
      authorization: `Bearer ${alice.tokens.access_token}`,
    };
    const bobHeaders = { authorization: `Bearer ${bob.tokens.access_token}` };
    const me = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: bobHeaders,
    });
    expect(me.statusCode).toBe(200);
    const profile = me.json<UserProfile>();
    expect(profile.email).toBe(bob.user.email);
    expect(profile).not.toHaveProperty('password_hash');

    const list = await app.inject({
      method: 'GET',
      url: '/users',
      query: { login: bob.user.login },
      headers: aliceHeaders,
    });
    expect(list.statusCode).toBe(200);
    const { items } = list.json<{ items: PublicUser[] }>();
    expect(items).toContainEqual({
      id: profile.id,
      login: bob.user.login,
      age: bob.user.age,
      description: null,
      avatars: [],
    });
    for (const user of items) {
      expect(user).not.toHaveProperty('email');
      expect(user).not.toHaveProperty('password_hash');
    }

    const other = await app.inject({
      method: 'GET',
      url: `/users/${profile.id}`,
      headers: aliceHeaders,
    });
    expect(other.statusCode).toBe(200);
    expect(other.json<PublicUser>()).not.toHaveProperty('email');

    const update = await app.inject({
      method: 'PATCH',
      url: `/users/${profile.id}`,
      headers: bobHeaders,
      payload: { age: 30 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json<PublicUser>()).not.toHaveProperty('email');
  });

  describe('Маршруты пользователей', () => {
    let owner: Awaited<ReturnType<typeof register>>;
    let another: Awaited<ReturnType<typeof register>>;
    let ownerId: number;

    beforeAll(async () => {
      owner = await register();
      another = await register();
      const storedUser = await database
        .selectFrom('users')
        .select('id')
        .where('login', '=', owner.user.login)
        .executeTakeFirstOrThrow();
      ownerId = storedUser.id;
    });

    it('сохраняет изменения своего профиля в БД и возвращает их при чтении', async () => {
      const headers = {
        authorization: `Bearer ${owner.tokens.access_token}`,
      };
      const changes = { age: 30, description: 'Обновлённый профиль' };
      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${ownerId}`,
        headers,
        payload: changes,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<PublicUser>()).toMatchObject(changes);

      const storedUser = await database
        .selectFrom('users')
        .select(['age', 'description', 'deleted_at'])
        .where('id', '=', ownerId)
        .executeTakeFirstOrThrow();
      expect(storedUser).toEqual({ ...changes, deleted_at: null });
      const profile = await app.inject({
        method: 'GET',
        url: '/users/me',
        headers,
      });
      expect(profile.statusCode).toBe(200);
      expect(profile.json<UserProfile>()).toMatchObject(changes);
    });

    it.each(['PATCH', 'DELETE'] as const)(
      '%s чужого профиля возвращает 403 и сохраняет пользователя и сессии',
      async (method) => {
        const findUser = () =>
          database
            .selectFrom('users')
            .selectAll()
            .where('id', '=', ownerId)
            .executeTakeFirstOrThrow();
        const findSessions = () =>
          database
            .selectFrom('refresh_tokens')
            .selectAll()
            .where('user_id', '=', ownerId)
            .orderBy('session_id')
            .execute();
        const beforeUser = await findUser();
        const beforeSessions = await findSessions();
        expect(beforeSessions).toHaveLength(1);

        const response = await app.inject({
          method,
          url: `/users/${ownerId}`,
          headers: { authorization: `Bearer ${another.tokens.access_token}` },
          ...(method === 'PATCH' ? { payload: { age: 40 } } : {}),
        });

        expect(response.statusCode).toBe(403);
        expect(response.json<{ message: string[] }>().message).toEqual([
          'Нет доступа к чужому профилю',
        ]);
        expect(await findUser()).toEqual(beforeUser);
        expect(await findSessions()).toEqual(beforeSessions);
      },
    );

    const methods = ['GET', 'PATCH', 'DELETE'] as const;
    const invalidIds = [
      '0',
      '-1',
      '2147483648',
      '999999999999999999999',
      '1.5',
      'abc',
    ];

    it.each(
      methods.flatMap((method) =>
        invalidIds.map((id) => [method, id] as const),
      ),
    )('%s /users/%s возвращает 400', async (method, id) => {
      const response = await app.inject({
        method,
        url: `/users/${id}`,
        headers: { authorization: `Bearer ${owner.tokens.access_token}` },
        ...(method === 'PATCH' ? { payload: { age: 30 } } : {}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('GET /users/1 возвращает профиль существующего пользователя', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/1',
        headers: { authorization: `Bearer ${owner.tokens.access_token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<PublicUser>()).toMatchObject({
        id: legacyUserId,
        login: 'legacy',
      });
    });

    it('GET /users/2147483647 возвращает 404 для отсутствующего пользователя', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/2147483647',
        headers: { authorization: `Bearer ${owner.tokens.access_token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it.each([
      ['GET', ''],
      ['GET', '/me'],
      ['GET', '/:id'],
      ['PATCH', '/:id'],
      ['DELETE', '/:id'],
    ] as const)(
      '%s /users%s без авторизации возвращает 401',
      async (method, path) => {
        const response = await app.inject({
          method,
          url: `/users${path.replace(':id', String(ownerId))}`,
          ...(method === 'PATCH' ? { payload: { age: 30 } } : {}),
        });

        expect(response.statusCode).toBe(401);
        expect(response.json<{ message: string[] }>().message).toEqual([
          'Требуется Bearer-токен',
        ]);
      },
    );

    it.each(['invalid', 'refresh'] as const)(
      'отклоняет %s вместо access-токена',
      async (type) => {
        const token =
          type === 'refresh' ? owner.tokens.refresh_token : 'invalid';
        const response = await app.inject({
          method: 'GET',
          url: '/users/me',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(401);
      },
    );
  });
});
