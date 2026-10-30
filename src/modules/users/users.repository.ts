import { ConflictException, Injectable } from '@nestjs/common';
import type { Insertable, Updateable } from 'kysely';
import { DatabaseService } from '../../database/database.service';
import type { Database } from '../../database/database.types';
import { DatabaseError } from 'pg';

type NewUser = Insertable<Database['users']>;
type UserChanges = Updateable<
  Omit<Database['users'], 'id' | 'password_hash' | 'deleted_at'>
>;

const publicFields = ['id', 'login', 'email', 'birth_date', 'about'] as const;

type FindUsersParams = {
  limit: number;
  offset: number;
  login?: string;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(data: NewUser) {
    try {
      return await this.database.db
        .insertInto('users')
        .values(data)
        .returning(publicFields)
        .executeTakeFirstOrThrow();
    } catch (error: unknown) {
      this.uniqueUserError(error);
    }
  }

  async findAll({ limit, offset, login }: FindUsersParams) {
    let query = this.database.db
      .selectFrom('users')
      .where('deleted_at', 'is', null);

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
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  findAuthInfoByLogin(login: string) {
    return this.database.db
      .selectFrom('users')
      .select(['id', 'password_hash'])
      .where('login', '=', login)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async update(id: number, data: UserChanges) {
    try {
      return await this.database.db
        .updateTable('users')
        .set(data)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returning(publicFields)
        .executeTakeFirst();
    } catch (error: unknown) {
      this.uniqueUserError(error);
    }
  }

  remove(id: number) {
    return this.database.db.transaction().execute(async (trx) => {
      const user = await trx
        .updateTable('users')
        .set({ deleted_at: new Date() })
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returning('id')
        .executeTakeFirst();

      if (!user) {
        return undefined;
      }

      await trx
        .deleteFrom('refresh_tokens')
        .where('user_id', '=', id)
        .execute();

      return user;
    });
  }

  private uniqueUserError(error: unknown): never {
    if (error instanceof DatabaseError && error.code === '23505') {
      throw new ConflictException(
        'Пользователь с таким email или login уже существует',
      );
    }

    throw error;
  }
}
