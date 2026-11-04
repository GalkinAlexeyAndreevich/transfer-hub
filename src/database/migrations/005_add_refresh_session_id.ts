import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Старые refresh JWT не содержат sid и требуют повторного входа.
  await sql`DELETE FROM refresh_tokens`.execute(db);

  await db.schema
    .alterTable('refresh_tokens')
    .addColumn('session_id', 'uuid', (column) => column.notNull().unique())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('refresh_tokens')
    .dropColumn('session_id')
    .execute();
}
