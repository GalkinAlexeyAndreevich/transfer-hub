import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Kysely } from 'kysely';
import type { Database } from '@/database/database.types';
import type { PublicUser, UserProfile } from './support/api.types';
import { register, type RegisteredUser } from './support/auth.helpers';
import { createTestApp, type TestApp } from './support/test-app';

describe('Users (PostgreSQL)', () => {
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

  it.each(['login', 'email'] as const)(
    'возвращает 409 при обновлении на занятый %s и сохраняет исходные данные',
    async (field) => {
      const owner = await register(app);
      const occupied = await register(app);
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

  it('возвращает email только в собственном профиле', async () => {
    const alice = await register(app);
    const bob = await register(app);
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
    let owner: RegisteredUser;
    let another: RegisteredUser;
    let ownerId: number;

    beforeEach(async () => {
      owner = await register(app);
      another = await register(app);
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

    it('GET /users/:id возвращает профиль существующего пользователя', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/users/${ownerId}`,
        headers: { authorization: `Bearer ${owner.tokens.access_token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<PublicUser>()).toMatchObject({
        id: ownerId,
        login: owner.user.login,
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
