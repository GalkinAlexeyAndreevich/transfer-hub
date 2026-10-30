import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';
import * as argon2 from 'argon2';
import type { FindUsersQueryDto } from './dto/find-users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UsersRepository) {}
  async create(dto: CreateUserDto) {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      return await this.userRepository.create({
        login: dto.login,
        email: dto.email,
        password_hash: passwordHash,
        birth_date: dto.birth_date,
        about: dto.about ?? null,
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Пользователь с таким email или login уже существует',
        );
      }

      throw error;
    }
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

  async me(id: number) {
    const user = await this.findOne(id);

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    return user;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return this.userRepository.update(id, updateUserDto);
  }

  remove(id: number) {
    return this.userRepository.remove(id);
  }
}
