import {
  NotFoundException,
  StandardSchemaValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '@/modules/auth/guards/access-token.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController: валидация ID', () => {
  let app: NestFastifyApplication;
  const service: jest.Mocked<
    Pick<UsersService, 'findOneOrThrow' | 'update' | 'remove'>
  > = {
    findOneOrThrow: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
          request.user = { id: 1 };
          return true;
        },
      })
      .compile();

    const adapter = new FastifyAdapter();
    app = module.createNestApplication<NestFastifyApplication>(adapter);
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await adapter.getInstance().ready();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const methods = ['GET', 'PATCH', 'DELETE'] as const;
  const invalidIds = [
    '0',
    '-1',
    '2147483648',
    '999999999999999999999',
    '1.5',
    'abc',
  ];

  it.each(
    methods.flatMap((method) => invalidIds.map((id) => [method, id] as const)),
  )('%s /users/%s возвращает 400 до вызова сервиса', async (method, id) => {
    const response = await app.inject({
      method,
      url: `/users/${id}`,
      ...(method === 'PATCH' ? { payload: { age: 30 } } : {}),
    });

    expect(response.statusCode).toBe(400);
    expect(service.findOneOrThrow).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it.each([1, 2147483647])(
    'принимает граничный ID %i как число',
    async (id) => {
      service.findOneOrThrow.mockResolvedValue({
        id,
        login: 'test',
        age: 25,
        description: null,
      });

      const response = await app.inject({ method: 'GET', url: `/users/${id}` });

      expect(response.statusCode).toBe(200);
      expect(service.findOneOrThrow).toHaveBeenCalledWith(id);
    },
  );

  it('сохраняет 404 для отсутствующего пользователя с допустимым ID', async () => {
    service.findOneOrThrow.mockRejectedValue(
      new NotFoundException('Пользователь не найден'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/users/2147483647',
    });

    expect(response.statusCode).toBe(404);
    expect(service.findOneOrThrow).toHaveBeenCalledWith(2147483647);
  });
});
