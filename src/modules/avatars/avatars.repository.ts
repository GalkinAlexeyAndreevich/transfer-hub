import { Injectable } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';
import { DatabaseService } from '@/database/database.service';
import type { Database } from '@/database/database.types';

@Injectable()
export class AvatarsRepository {
  constructor(private readonly database: DatabaseService) {}

  async countActive(userId: number, db: Kysely<Database> = this.database.db) {
    const { count } = await db
      .selectFrom('avatars')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();

    return Number(count);
  }

  create(userId: number, key: string, trx: Transaction<Database>) {
    return trx
      .insertInto('avatars')
      .values({ user_id: userId, object_key: key })
      .returning(['id', 'object_key as avatarKey', 'uploaded_at as uploadedAt'])
      .executeTakeFirstOrThrow();
  }

  softDelete(userId: number, avatarId: number, trx: Transaction<Database>) {
    return trx
      .updateTable('avatars')
      .set({ deleted_at: new Date() })
      .where('id', '=', avatarId)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
  }
}
