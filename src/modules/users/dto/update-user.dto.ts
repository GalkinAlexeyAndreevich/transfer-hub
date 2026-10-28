import { z } from 'zod';
import { createUserSchema } from './create-user.dto';

export const updateUserSchema = createUserSchema
  .pick({
    login: true,
    email: true,
    birth_date: true,
    about: true,
  })
  .partial()
  .refine((dto) => Object.values(dto).some((value) => value !== undefined), {
    error: 'Передай хотя бы одно поле для обновления',
  });

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
