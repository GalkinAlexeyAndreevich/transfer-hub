import { textSchema } from '@/common/schemas/text.schema';
import { z } from 'zod';

export const findUsersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  login: textSchema.trim().max(50).optional(),
});

export type FindUsersQueryDto = z.infer<typeof findUsersQuerySchema>;
