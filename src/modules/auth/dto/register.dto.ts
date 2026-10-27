import z from 'zod';

export const registerSchema = z.object({
  login: z.string().min(1).max(50),
  email: z.email().max(254),
  password: z.string().min(12),
  birth_date: z.iso.date(),
  about: z.string().max(1000).nullish(),
});

export type registerDto = z.infer<typeof registerSchema>;
