import { StandardSchemaValidationPipe } from '@nestjs/common';
import { loginSchema } from '@/modules/auth/dto/login.dto';
import { createUserSchema } from './create-user.dto';
import { findUsersQuerySchema } from './find-users.dto';
import { updateUserSchema } from './update-user.dto';

describe('User schemas', () => {
  const validUser = {
    login: 'alexey',
    email: 'alexey@example.com',
    password: 'ExamplePassword123!',
    age: 25,
    description: 'О себе',
  };

  it('принимает корректную регистрацию', () => {
    expect(createUserSchema.parse(validUser)).toEqual(validUser);
  });

  it.each([0, 150])('принимает граничный возраст %i', (age) => {
    const result = createUserSchema.safeParse({ ...validUser, age });

    expect(result.success).toBe(true);
  });

  it.each([-1, 151, 1.5, '25', null, undefined])(
    'отклоняет некорректный возраст %p',
    (age) => {
      const result = createUserSchema.safeParse({ ...validUser, age });

      expect(result.success).toBe(false);
    },
  );

  it.each([
    [1000, true],
    [1001, false],
  ])('проверяет длину описания %i', (length, expected) => {
    const result = createUserSchema.safeParse({
      ...validUser,
      description: 'a'.repeat(length),
    });

    expect(result.success).toBe(expected);
  });

  it('отклоняет логин из пробелов', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      login: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('отклоняет лишние поля', () => {
    const result = createUserSchema.safeParse({
      ...validUser,
      id: 100,
    });

    expect(result.success).toBe(false);
  });

  it('разрешает обновить только возраст', () => {
    expect(updateUserSchema.parse({ age: 30 })).toEqual({ age: 30 });
  });

  it('разрешает очистить описание', () => {
    expect(updateUserSchema.parse({ description: null })).toEqual({
      description: null,
    });
  });

  it('отклоняет пустое обновление', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });

  it.each([
    [
      'логин при регистрации',
      createUserSchema,
      { ...validUser, login: 'alex\u0000ey' },
      'login',
      'body',
    ],
    [
      'описание при регистрации',
      createUserSchema,
      { ...validUser, description: 'О\u0000себе' },
      'description',
      'body',
    ],
    [
      'логин при входе',
      loginSchema,
      { login: 'alex\u0000ey', password: validUser.password },
      'login',
      'body',
    ],
    [
      'описание при обновлении',
      updateUserSchema,
      { description: 'О\u0000себе' },
      'description',
      'body',
    ],
    [
      'логин при обновлении',
      updateUserSchema,
      { login: 'alex\u0000ey' },
      'login',
      'body',
    ],
    [
      'поисковую строку',
      findUsersQuerySchema,
      { login: 'alex\u0000ey' },
      'login',
      'query',
    ],
  ] as const)(
    'отклоняет %s с U+0000: 400 с названием поля',
    async (_name, schema, value, field, type) => {
      const pipe = new StandardSchemaValidationPipe();

      await expect(
        pipe.transform(value, { type, schema }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 400,
          message: [expect.stringContaining(`${field}:`)],
        },
      });
    },
  );

  it('разрешает многострочное описание', () => {
    const description = 'Первая строка\nВторая строка';

    expect(
      createUserSchema.parse({ ...validUser, description }).description,
    ).toBe(description);
  });

  it('сохраняет пароль дословно при регистрации и входе', () => {
    const password = ' Example\u0000Password123! ';

    expect(createUserSchema.parse({ ...validUser, password }).password).toBe(
      password,
    );
    expect(
      loginSchema.parse({ login: validUser.login, password }).password,
    ).toBe(password);
  });
});
