import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { Pool } from 'pg';
import type { Database } from '@/database/database.types';
import * as createUsers from '@/database/migrations/001_create_users';
import * as createRefreshTokens from '@/database/migrations/002_create_refresh_tokens';
import * as addDeletedAt from '@/database/migrations/003_add_users_deleted_at';
import * as addAgeDescription from '@/database/migrations/004_users_age_description';
import * as addRefreshSessionId from '@/database/migrations/005_add_refresh_session_id';
import * as usersActiveUniqueIndexes from '@/database/migrations/006_users_active_unique_indexes';
import * as addRefreshTokensUserFk from '@/database/migrations/007_add_refresh_tokens_user_fk';
import * as createAvatars from '@/database/migrations/008_create_avatars';

export async function createTestDatabase(
  connectionString: string,
  migration?: string,
) {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  });
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const database = new Kysely<Database>({
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

  async function close() {
    try {
      await database.destroy();
    } finally {
      try {
        await admin.schema.dropSchema(schema).ifExists().cascade().execute();
      } finally {
        await admin.destroy();
      }
    }
  }

  try {
    await admin.schema.createSchema(schema).execute();
    const migrated = migration
      ? await migrator.migrateTo(migration)
      : await migrator.migrateToLatest();
    if (migrated.error) {
      throw new Error('Не удалось применить миграции к тестовой схеме', {
        cause: migrated.error,
      });
    }

    return { database, migrator, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
