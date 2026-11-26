import { Injectable } from '@nestjs/common';
import type {
  ExpressionBuilder,
  Insertable,
  Kysely,
  Transaction,
  Updateable,
} from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { DatabaseService } from '@/database/database.service';
import type { Database } from '@/database/database.types';
import { DatabaseError } from 'pg';
import { UserAlreadyExistsError } from './errors/user.errors';

type NewUser = Insertable<Database['users']>;
type UserChanges = Updateable<
  Omit<Database['users'], 'id' | 'password_hash' | 'deleted_at'>
>;

const publicFields = ['id', 'login', 'age', 'description'] as const;
const profileFields = [...publicFields, 'email'] as const;

// Формируем подзапрос с получением аватаров
function activeAvatars(eb: ExpressionBuilder<Database, 'users'>) {
  return jsonArrayFrom(
    eb
      .selectFrom('avatars')
      .select([
        'avatars.id',
        'avatars.object_key as avatarKey',
        'avatars.uploaded_at as uploadedAt',
      ])
      .whereRef('avatars.user_id', '=', 'users.id')
      .where('avatars.deleted_at', 'is', null)
      .orderBy('avatars.uploaded_at', 'desc')
      .orderBy('avatars.id', 'desc'),
  ).as('avatars');
}

type AvatarJson = { id: number; avatarKey: string; uploadedAt: string };

// После конветации json необходимо вернуть uploadedAt как дату, а не строку
function withAvatarDates<User extends { avatars: AvatarJson[] }>(user: User) {
  const { avatars, ...fields } = user;
  return {
    ...fields,
    avatars: avatars.map((avatar) => ({
      ...avatar,
      uploadedAt: new Date(avatar.uploadedAt),
    })),
  };
}

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
      const user = await this.database.db
        .insertInto('users')
        .values(data)
        .returning(publicFields)
        .returning(activeAvatars)
        .executeTakeFirstOrThrow();
      return withAvatarDates(user);
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
        .select(activeAvatars)
        .orderBy('id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),

      query
        .select(({ fn }) => fn.countAll<string>().as('total'))
        .executeTakeFirstOrThrow(),
    ]);

    return {
      items: items.map(withAvatarDates),
      total: Number(count.total),
    };
  }

  async findOne(id: number) {
    const user = await this.database.db
      .selectFrom('users')
      .select(publicFields)
      .select(activeAvatars)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return user && withAvatarDates(user);
  }

  findOneForUpdate(id: number, trx: Transaction<Database>) {
    return trx
      .selectFrom('users')
      .select('id')
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
  }

  async findProfile(id: number) {
    const user = await this.database.db
      .selectFrom('users')
      .select(profileFields)
      .select(activeAvatars)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return user && withAvatarDates(user);
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
      const user = await this.database.db
        .updateTable('users')
        .set(data)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returning(publicFields)
        .returning(activeAvatars)
        .executeTakeFirst();
      return user && withAvatarDates(user);
    } catch (error: unknown) {
      this.uniqueUserError(error);
    }
  }

  remove(id: number, db: Kysely<Database> = this.database.db) {
    return db
      .updateTable('users')
      .set({ deleted_at: new Date() })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
  }

  private uniqueUserError(error: unknown): never {
    if (
      error instanceof DatabaseError &&
      error.code === '23505' &&
      (error.constraint === 'users_login_active_uq' ||
        error.constraint === 'users_email_active_uq')
    ) {
      throw new UserAlreadyExistsError(undefined, { cause: error });
    }

    throw error;
  }
}
