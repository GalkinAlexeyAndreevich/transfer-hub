import { z } from 'zod';

export const createUserSchema = z.strictObject({
  login: z.string().min(1).max(50),
  email: z.email().max(254),
  password: z.string().min(12),
  birth_date: z.iso.date(),
  about: z.string().max(1000).nullish(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
