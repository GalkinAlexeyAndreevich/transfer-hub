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

  birth_date: z.iso.date().meta({
    description: 'Дата рождения в формате YYYY-MM-DD',
    example: '1998-05-21',
  }),

  about: z.string().max(1000).nullish().meta({
    description: 'О себе. Можно не передавать или указать null',
    example: 'Я продаю бананы, людей. Шучу, не бананы',
  }),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
