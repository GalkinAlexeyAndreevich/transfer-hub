import { z } from 'zod';

export const createUserSchema = z.strictObject({
  login: z.string().trim().min(1).max(50).meta({
    description: 'Логин пользователя',
    example: 'alexey',
  }),

  email: z.email().trim().toLowerCase().pipe(z.email().max(254)).meta({
    description: 'Электронная почта',
    example: 'alexey@example.com',
  }),

  password: z.string().min(12).meta({
    description: 'Пароль: минимум 12 символов',
    example: 'ExamplePassword123!',
  }),

  age: z.number().int().min(0).max(150).meta({
    description: 'Возраст',
    example: '22',
  }),

  description: z.string().max(1000).nullish().meta({
    description: 'О себе. Можно не передавать или указать null',
    example: 'Я продаю бананы, людей. Шучу, не бананы',
  }),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
