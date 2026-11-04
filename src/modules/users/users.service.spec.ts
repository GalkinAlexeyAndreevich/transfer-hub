import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { PasswordService } from '@/common/password/password.service';

describe('UsersService', () => {
  let service: UsersService;

  let repository: jest.Mocked<Pick<UsersRepository, 'update' | 'remove'>>;

  beforeEach(async () => {
    repository = {
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: repository,
        },
        {
          provide: PasswordService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('разрешает обновить свой профиль', async () => {
    const user = {
      id: 1,
      login: 'alexey',
      age: 30,
      description: null,
    };

    repository.update.mockResolvedValue(user);

    const result = await service.update(1, { age: 30 }, 1);

    expect(result).toEqual(user);
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith(1, { age: 30 });
  });

  it('запрещает обновление чужого профиля', async () => {
    await expect(service.update(1, { age: 30 }, 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('возвращает ошибку, если обновляемый пользователь не найден', async () => {
    repository.update.mockResolvedValue(undefined);

    await expect(service.update(1, { age: 30 }, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('запрещает удаление чужого профиля', async () => {
    await expect(service.remove(1, 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(repository.remove).not.toHaveBeenCalled();
  });
});
