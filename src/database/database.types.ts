import type { ColumnType, Generated } from 'kysely';

export interface Database {
  users: {
    id: Generated<number>;
    login: string;
    email: string;
    password_hash: string;
    age: number;
    description: string | null;
    deleted_at: ColumnType<Date | null>;
  };

  refresh_tokens: {
    session_id: string;
    token_hash: string;
    user_id: number;
    expires_at: Date;
  };
}
