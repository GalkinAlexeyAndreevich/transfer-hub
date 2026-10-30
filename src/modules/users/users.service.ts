import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';
import type { FindUsersQueryDto } from './dto/find-users.dto';
import { PasswordService } from 'src/common/password/password.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UsersRepository,
    private readonly passwordService: PasswordService,
  ) {}
  async create(dto: CreateUserDto) {
    const passwordHash = await this.passwordService.hash(dto.password);

    return this.userRepository.create({
      login: dto.login,
      email: dto.email,
      password_hash: passwordHash,
      birth_date: dto.birth_date,
      about: dto.about ?? null,
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
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  async me(id: number) {
    const user = await this.findOne(id);

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto, initiatorId: number) {
    if (initiatorId !== id) {
      throw new ForbiddenException('Нельзя изменять чужой профиль');
    }

    const user = await this.userRepository.update(id, dto);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  async remove(id: number, initiatorId: number) {
    if (initiatorId !== id) {
      throw new ForbiddenException('Нельзя удалять чужой профиль');
    }

    const user = await this.userRepository.remove(id);

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }
}
