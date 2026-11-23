import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE users
    DROP CONSTRAINT users_login_key,
    DROP CONSTRAINT users_email_key
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX users_login_active_uq
    ON users (login) WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX users_email_active_uq
    ON users (email) WHERE deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE users
    ADD CONSTRAINT users_login_key UNIQUE (login),
    ADD CONSTRAINT users_email_key UNIQUE (email)
  `.execute(db);

  await sql`DROP INDEX users_login_active_uq`.execute(db);
  await sql`DROP INDEX users_email_active_uq`.execute(db);
}
