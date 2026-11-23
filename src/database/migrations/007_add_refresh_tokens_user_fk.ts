import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('refresh_tokens')
    .addForeignKeyConstraint(
      'refresh_tokens_user_id_fkey',
      ['user_id'],
      'users',
      ['id'],
    )
    .onDelete('cascade')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('refresh_tokens')
    .dropConstraint('refresh_tokens_user_id_fkey')
    .execute();
}
