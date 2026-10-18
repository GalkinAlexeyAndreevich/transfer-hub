import type { ColumnType, Generated } from 'kysely';

export interface Database {
  users: {
    id: Generated<number>;
    login: string;
    email: string;
    password_hash: string;
    birth_date: ColumnType<Date, string, string>;
    about: string | null;
  };
}
