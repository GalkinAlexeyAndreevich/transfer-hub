import { z } from 'zod';

export const loginSchema = z.strictObject({
  login: z.string().min(1).max(50),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;
