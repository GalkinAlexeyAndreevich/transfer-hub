// auth/dto/refresh-token.dto.ts
import { z } from 'zod';

export const refreshTokenSchema = z.strictObject({
  refresh_token: z.string().min(1),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
