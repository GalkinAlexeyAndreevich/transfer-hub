import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { validateEnv } from './validate-env';

const schema = z.object({
  JWT_SECRET: z.string().min(32),
  ACCESS_TTL_SECONDS: z.coerce.number().int().min(1),
  REFRESH_TTL_SECONDS: z.coerce.number().int().min(1),
});

export default registerAs('jwt', () => validateEnv(schema, process.env));
