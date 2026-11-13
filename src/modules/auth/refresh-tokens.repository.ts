import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/database/database.service';
import { sql } from 'kysely';

type RefreshSession = {
  userId: number;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
};

type RefreshRotation = Omit<RefreshSession, 'tokenHash'> & {
  oldHash: string;
  newHash: string;
};

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly database: DatabaseService) {}

  findActiveByHash(tokenHash: string) {
    return this.database.db
      .selectFrom('refresh_tokens')
      .select(['user_id', 'session_id'])
      .where('token_hash', '=', tokenHash)
      .where('expires_at', '>', sql<Date>`now()`)
      .executeTakeFirst();
  }

  create({ userId, sessionId, tokenHash, expiresAt }: RefreshSession) {
    return this.database.db.transaction().execute(async (trx) => {
      const user = await trx
        .selectFrom('users')
        .select('id')
        .where('id', '=', userId)
        .where('deleted_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();

      if (!user) {
        return false;
      }

      await trx
        .insertInto('refresh_tokens')
        .values({
          session_id: sessionId,
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
        })
        .execute();

      return true;
    });
  }

  removeSession(userId: number, sessionId: string) {
    return this.database.db
      .deleteFrom('refresh_tokens')
      .where('session_id', '=', sessionId)
      .where('user_id', '=', userId)
      .execute();
  }

  rotate({ sessionId, userId, oldHash, newHash, expiresAt }: RefreshRotation) {
    return this.database.db
      .updateTable('refresh_tokens')
      .set({
        token_hash: newHash,
        expires_at: expiresAt,
      })
      .where('session_id', '=', sessionId)
      .where('user_id', '=', userId)
      .where('token_hash', '=', oldHash)
      .where('expires_at', '>', sql<Date>`now()`)
      .returning('user_id')
      .executeTakeFirst();
  }
}
