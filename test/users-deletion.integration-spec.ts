import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse } from 'fastify';
import type { Kysely } from 'kysely';
import { DatabaseService } from '@/database/database.service';
import type { Database } from '@/database/database.types';
import { RefreshTokensRepository } from '@/modules/sessions/refresh-tokens.repository';
import { UsersRepository } from '@/modules/users/users.repository';
import type { PublicUser } from './support/api.types';
import { readTokens, refresh, register } from './support/auth.helpers';
import { gate } from './support/gate';
import { createTestApp, type TestApp } from './support/test-app';

describe('User deletion (PostgreSQL)', () => {
  let context: TestApp | undefined;
  let app: NestFastifyApplication;
  let database: Kysely<Database>;

  beforeAll(async () => {
    context = await createTestApp();
    ({ app, database } = context);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await context?.close();
  });

  it('soft delete скрывает пользователя и отзывает все его сессии', async () => {
    const { user, tokens } = await register(app);
    const observer = await register(app);
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
      expect((await refresh(app, session.refresh_token)).statusCode).toBe(401);
    }
    const relogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: user.password },
    });
    expect(relogin.statusCode).toBe(401);
    expect(await findSessions()).toEqual([]);
    expect((await refresh(app, observer.tokens.refresh_token)).statusCode).toBe(
      201,
    );
  });

  it('откатывает soft delete и отзыв сессий при ошибке транзакции', async () => {
    const { user, tokens } = await register(app);
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
    expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(201);
  });

  async function startPausedLogin(checkpoint: 'before-lock' | 'after-lock') {
    const { user, tokens } = await register(app);
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
    expect((await refresh(app, refreshToken)).statusCode).toBe(401);
  });

  it.each(['login', 'email', 'login и email'])(
    'позволяет повторно использовать %s после soft delete, сохраняя уникальность активных',
    async (field) => {
      const { user, tokens } = await register(app);
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
});
