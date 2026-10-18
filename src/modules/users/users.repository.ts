import { Injectable } from '@nestjs/common';
import type { Insertable, Updateable } from 'kysely';
import { DatabaseService } from '../../database/database.service';
import type { Database } from '../../database/database.types';

type NewUser = Insertable<Database['users']>;
type UserChanges = Updateable<Omit<Database['users'], 'id'>>;

const publicFields = ['id', 'login', 'email', 'birth_date', 'about'] as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  create(data: NewUser) {
    return this.database.db
      .insertInto('users')
      .values(data)
      .returning(publicFields)
      .executeTakeFirstOrThrow();
  }

  findAll() {
    return this.database.db.selectFrom('users').select(publicFields).execute();
  }

  findOne(id: number) {
    return this.database.db
      .selectFrom('users')
      .select(publicFields)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  update(id: number, data: UserChanges) {
    return this.database.db
      .updateTable('users')
      .set(data)
      .where('id', '=', id)
      .returning(publicFields)
      .executeTakeFirst();
  }

  remove(id: number) {
    return this.database.db
      .deleteFrom('users')
      .where('id', '=', id)
      .returning('id')
      .executeTakeFirst();
  }
}
