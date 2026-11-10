import { randomUUID } from 'node:crypto';
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
import type { TokenPair } from '@/modules/auth/auth.service';
import { hashToken } from '@/modules/auth/helpers/hash-token';
import { RefreshTokensRepository } from '@/modules/auth/refresh-tokens.repository';
import { TokenService } from '@/modules/auth/token.service';

type PublicUser = {
  id: number;
  login: string;
  age: number;
  description: string | null;
};

type UserProfile = PublicUser & { email: string };

function gate() {
  let resolve = () => {};
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

describe('Auth sessions and user privacy (PostgreSQL)', () => {
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
            throw new Error('Не удалось применить миграцию сессий', {
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

    return { user, tokens: response.json<TokenPair>() };
  }

  function refresh(token: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/refresh-token',
      payload: { refresh_token: token },
    });
  }

  function logout(token: string) {
    return app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refresh_token: token },
    });
  }

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
    const tokenService = app.get(TokenService);
    const initial = await tokenService.verifyRefreshToken(tokens.refresh_token);
    const response = await refresh(tokens.refresh_token);
    expect(response.statusCode).toBe(201);
    const rotated = response.json<TokenPair>();
    const verified = await tokenService.verifyRefreshToken(
      rotated.refresh_token,
    );
    expect(verified.sessionId).toBe(initial.sessionId);
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(401);

    const stored = await database
      .selectFrom('refresh_tokens')
      .select('token_hash')
      .where('session_id', '=', initial.sessionId)
      .executeTakeFirstOrThrow();
    expect(stored.token_hash).toBe(hashToken(rotated.refresh_token));
    expect(stored.token_hash).not.toBe(rotated.refresh_token);
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

  it('logout отзывает новую пару, когда refresh уже заменил хеш', async () => {
    const { tokens } = await register();
    const repository = app.get(RefreshTokensRepository);
    const databaseRepository = new RefreshTokensRepository(
      app.get<DatabaseService>(DatabaseService),
    );
    const updated = gate();
    const release = gate();
    jest.spyOn(repository, 'rotate').mockImplementationOnce(async (params) => {
      const result = await databaseRepository.rotate(params);
      updated.resolve();
      await release.promise;
      return result;
    });

    const pending = refresh(tokens.refresh_token);
    try {
      await Promise.race([
        updated.promise,
        pending.then(() => {
          throw new Error('Refresh завершился до контрольной точки');
        }),
      ]);
      expect((await logout(tokens.refresh_token)).statusCode).toBe(200);
    } finally {
      release.resolve();
    }

    const response = await pending;
    expect(response.statusCode).toBe(201);
    const rotated = response.json<TokenPair>();
    expect((await refresh(rotated.refresh_token)).statusCode).toBe(401);
  });

  it('не обновляет токены, если logout завершился раньше refresh', async () => {
    const { tokens } = await register();

    expect((await logout(tokens.refresh_token)).statusCode).toBe(200);
    expect((await refresh(tokens.refresh_token)).statusCode).toBe(401);
    expect((await logout(tokens.refresh_token)).statusCode).toBe(200);
  });

  it('отзывает только выбранную сессию пользователя', async () => {
    const { user, tokens } = await register();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: user.password },
    });
    expect(login.statusCode).toBe(201);
    const anotherSession = login.json<TokenPair>();

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
      headers: aliceHeaders,
    });
    expect(list.statusCode).toBe(200);
    const { items } = list.json<{ items: PublicUser[] }>();
    expect(items).toContainEqual({
      id: profile.id,
      login: bob.user.login,
      age: bob.user.age,
      description: null,
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
});
