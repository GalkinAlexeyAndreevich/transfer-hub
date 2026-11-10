import { textSchema } from '@/common/schemas/text.schema';
import { z } from 'zod';

export const loginSchema = z
  .strictObject({
    login: textSchema.trim().min(1).max(50).meta({
      description: 'Логин пользователя',
      example: 'alexey',
    }),
    password: z.string().min(1).meta({
      description: 'Пароль пользователя',
      example: 'ExamplePassword123!',
    }),
  })
  .meta({
    description: 'Данные для входа',
    example: {
      login: 'alexey',
      password: 'ExamplePassword123!',
    },
  });

export type LoginDto = z.infer<typeof loginSchema>;
