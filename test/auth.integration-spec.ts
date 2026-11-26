import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Kysely } from 'kysely';
import { DatabaseService } from '@/database/database.service';
import type { Database } from '@/database/database.types';
import type { TokenPair } from '@/modules/auth/auth.service';
import { REFRESH_TOKEN_COOKIE } from '@/modules/auth/constants/auth.constants';
import { hashToken } from '@/modules/auth/helpers/hash-token';
import { RefreshTokensRepository } from '@/modules/sessions/refresh-tokens.repository';
import { logout, readTokens, refresh, register } from './support/auth.helpers';
import { gate } from './support/gate';
import { createTestApp, type TestApp } from './support/test-app';

describe('Auth (PostgreSQL)', () => {
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

  it('не создаёт сессию при входе с неверным паролем', async () => {
    const { user } = await register(app);
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

  it('ротирует одноразовый refresh в пределах одного sid и хранит хеш', async () => {
    const { tokens } = await register(app);
    const initial = await database
      .selectFrom('refresh_tokens')
      .select('session_id')
      .where('token_hash', '=', hashToken(tokens.refresh_token))
      .executeTakeFirstOrThrow();
    const response = await refresh(app, tokens.refresh_token);
    expect(response.statusCode).toBe(201);
    const rotated = readTokens(response);
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(401);

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
      const { tokens } = await register(app);
      const response = await app.inject({
        method: 'POST',
        url: `/auth/${route}`,
        payload: { refresh_token: tokens.refresh_token },
      });

      expect(response.statusCode).toBe(401);
      expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(201);
    },
  );

  it('проверяет срок refresh в БД', async () => {
    const { tokens } = await register(app);
    await database
      .updateTable('refresh_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('token_hash', '=', hashToken(tokens.refresh_token))
      .execute();

    expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(401);
    expect((await logout(app, tokens.refresh_token)).statusCode).toBe(401);
  });

  it('отклоняет неизвестный refresh и access вместо refresh', async () => {
    const { tokens } = await register(app);

    expect((await refresh(app, randomUUID())).statusCode).toBe(401);
    expect((await refresh(app, tokens.access_token)).statusCode).toBe(401);
    expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(201);
  });

  it('позволяет только один из двух одновременных refresh', async () => {
    const { tokens } = await register(app);
    const results = await Promise.all([
      refresh(app, tokens.refresh_token),
      refresh(app, tokens.refresh_token),
    ]);

    expect(results.map((response) => response.statusCode).sort()).toEqual([
      201, 401,
    ]);
  });

  it('logout отзывает ротированную сессию, найденную до замены хеша', async () => {
    const { tokens } = await register(app);
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

    const pending = logout(app, tokens.refresh_token);
    let rotated: TokenPair;
    try {
      await Promise.race([
        found.promise,
        pending.then(() => {
          throw new Error('Logout завершился до контрольной точки');
        }),
      ]);
      const response = await refresh(app, tokens.refresh_token);
      expect(response.statusCode).toBe(201);
      rotated = readTokens(response);
    } finally {
      release.resolve();
    }

    const response = await pending;
    expect(response.statusCode).toBe(200);
    expect((await refresh(app, rotated.refresh_token)).statusCode).toBe(401);
  });

  it('не обновляет токены, если logout завершился раньше refresh', async () => {
    const { tokens } = await register(app);

    const response = await logout(app, tokens.refresh_token);
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
    expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(401);
    expect((await logout(app, tokens.refresh_token)).statusCode).toBe(401);
  });

  it('отзывает только выбранную сессию пользователя', async () => {
    const { user, tokens } = await register(app);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { login: user.login, password: user.password },
    });
    expect(login.statusCode).toBe(201);
    const anotherSession = readTokens(login);

    expect((await logout(app, tokens.refresh_token)).statusCode).toBe(200);
    expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(401);
    expect((await refresh(app, anotherSession.refresh_token)).statusCode).toBe(
      201,
    );
  });

  it('не использует access для logout', async () => {
    const { tokens } = await register(app);

    expect((await logout(app, tokens.access_token)).statusCode).toBe(401);
    expect((await refresh(app, tokens.refresh_token)).statusCode).toBe(201);
  });
});
