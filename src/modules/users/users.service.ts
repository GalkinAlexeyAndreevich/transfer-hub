import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';
import type { FindUsersQueryDto } from './dto/find-users.dto';
import { hashPassword } from '@/common/helpers/password';
import { DatabaseService } from '@/database/database.service';
import { RefreshTokensRepository } from '@/modules/sessions/refresh-tokens.repository';
import {
  CurrentUserNotFoundError,
  ProfileAccessDeniedError,
  UserNotFoundError,
} from './errors/user.errors';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UsersRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly database: DatabaseService,
  ) {}
  async create(dto: CreateUserDto) {
    const passwordHash = await hashPassword(dto.password);

    return this.userRepository.create({
      login: dto.login,
      email: dto.email,
      password_hash: passwordHash,
      age: dto.age,
      description: dto.description ?? null,
    });
  }

  findAuthInfoByLogin(login: string) {
    return this.userRepository.findAuthInfoByLogin(login);
  }

  async findAll({ page, limit, login }: FindUsersQueryDto) {
    const { items, total } = await this.userRepository.findAll({
      limit,
      offset: (page - 1) * limit,
      login,
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  findOne(id: number) {
    return this.userRepository.findOne(id);
  }

  async findOneOrThrow(id: number) {
    const user = await this.findOne(id);

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  async me(id: number) {
    const user = await this.userRepository.findProfile(id);

    if (!user) {
      throw new CurrentUserNotFoundError();
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto, initiatorId: number) {
    if (initiatorId !== id) {
      throw new ProfileAccessDeniedError();
    }

    const user = await this.userRepository.update(id, dto);

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  async remove(id: number, initiatorId: number) {
    if (initiatorId !== id) {
      throw new ProfileAccessDeniedError();
    }

    return this.database.db.transaction().execute(async (trx) => {
      const user = await this.userRepository.remove(id, trx);

      if (!user) {
        throw new UserNotFoundError();
      }

      await this.refreshTokensRepository.removeAllForUser(id, trx);

      return user;
    });
  }
}
