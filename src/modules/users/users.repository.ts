import { Injectable } from '@nestjs/common';
import type { Insertable, Updateable } from 'kysely';
import { DatabaseService } from '../../database/database.service';
import type { Database } from '../../database/database.types';

type NewUser = Insertable<Database['users']>;
type UserChanges = Updateable<Omit<Database['users'], 'id'>>;

const publicFields = ['id', 'login', 'email', 'birth_date', 'about'] as const;

type FindUsersParams = {
  limit: number;
  offset: number;
  login?: string;
};

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

  async findAll({ limit, offset, login }: FindUsersParams) {
    let query = this.database.db.selectFrom('users');

    if (login) {
      const escapedLogin = login.replace(/[\\%_]/g, '\\$&'); // экранирование для запроса

      query = query.where('login', 'ilike', `%${escapedLogin}%`);
    }

    const [items, count] = await Promise.all([
      query
        .select(publicFields)
        .orderBy('id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),

      query
        .select(({ fn }) => fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow(),
    ]);

    return {
      items,
      total: Number(count.total),
    };
  }

  findOne(id: number) {
    return this.database.db
      .selectFrom('users')
      .select(publicFields)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  findAuthInfoByLogin(login: string) {
    return this.database.db
      .selectFrom('users')
      .select(['id', 'password_hash'])
      .where('login', '=', login)
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
