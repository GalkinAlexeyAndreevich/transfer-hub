import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .renameColumn('about', 'description')
    .execute();

  await db.schema.alterTable('users').addColumn('age', 'integer').execute();

  await sql`
    UPDATE users
    SET age = EXTRACT(YEAR FROM age(CURRENT_DATE, birth_date))::integer
  `.execute(db);

  await sql`
    ALTER TABLE users
    ALTER COLUMN age SET NOT NULL,
    ADD CONSTRAINT users_age_range CHECK (age BETWEEN 0 AND 150)
  `.execute(db);

  await sql`
    ALTER TABLE users
    DROP COLUMN birth_date
  `.execute(db);
}

export function down(): Promise<void> {
  return Promise.reject(
    new Error(
      'Миграция необратима: точную дату рождения нельзя восстановить из возраста. Используй резервную копию.',
    ),
  );
}
