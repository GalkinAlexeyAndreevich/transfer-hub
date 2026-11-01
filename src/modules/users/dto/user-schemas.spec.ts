import { createUserSchema } from './create-user.dto';
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
});
