import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

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
}
