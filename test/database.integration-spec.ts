import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { sql } from 'kysely';
import databaseConfig from '@/config/database.config';
import { hashToken } from '@/modules/auth/helpers/hash-token';
import { createTestDatabase, type TestDatabase } from './support/test-database';

describe('Database (PostgreSQL)', () => {
  let context: TestDatabase | undefined;

  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  it('миграция отзывает старые refresh и сохраняет пользователей', async () => {
    context = await createTestDatabase(
      databaseConfig().url,
      '004_users_age_description',
    );
    const { database, migrator } = context;
    const legacyHash = 'a'.repeat(64);
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
    await sql`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${legacyUser.id}, ${legacyHash}, now() + interval '1 day')
    `.execute(database);

    const migrated = await migrator.migrateToLatest();
    expect(migrated.error).toBeUndefined();

    const user = await database
      .selectFrom('users')
      .select('id')
      .where('id', '=', legacyUser.id)
      .executeTakeFirst();
    const token = await database
      .selectFrom('refresh_tokens')
      .select('token_hash')
      .where('token_hash', '=', legacyHash)
      .executeTakeFirst();

    expect(user).toEqual({ id: legacyUser.id });
    expect(token).toBeUndefined();
  });

  it('отклоняет сессию с несуществующим user_id на уровне БД', async () => {
    context = await createTestDatabase(databaseConfig().url);
    const { database } = context;

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
    context = await createTestDatabase(databaseConfig().url);
    const { database } = context;
    const storedUser = await database
      .insertInto('users')
      .values({
        login: 'cascade',
        email: 'cascade@example.com',
        password_hash: 'unused-test-hash',
        age: 25,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await database
      .insertInto('refresh_tokens')
      .values({
        session_id: randomUUID(),
        token_hash: hashToken(randomUUID()),
        user_id: storedUser.id,
        expires_at: new Date(Date.now() + 60_000),
      })
      .execute();
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
});
