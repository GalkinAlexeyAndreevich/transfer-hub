import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { sql } from 'kysely';

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly database: DatabaseService) {}

  create(userId: number, tokenHash: string, expiresAt: Date) {
    return this.database.db
      .insertInto('refresh_tokens')
      .values({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .execute();
  }

  removeByHash(tokenHash: string) {
    return this.database.db
      .deleteFrom('refresh_tokens')
      .where('token_hash', '=', tokenHash)
      .execute();
  }

  rotate(oldHash: string, userId: number, newHash: string, expiresAt: Date) {
    return this.database.db
      .updateTable('refresh_tokens')
      .set({
        token_hash: newHash,
        expires_at: expiresAt,
      })
      .where('token_hash', '=', oldHash)
      .where('user_id', '=', userId)
      .where('expires_at', '>', sql<Date>`now()`)
      .returning('user_id')
      .executeTakeFirst();
  }
}
