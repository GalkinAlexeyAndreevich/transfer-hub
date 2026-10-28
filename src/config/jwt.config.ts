import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { validateEnv } from './validate-env';

const schema = z
  .object({
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
  })
  .refine((env) => env.JWT_SECRET !== env.JWT_REFRESH_SECRET, {
    error: 'Access и refresh должны иметь разные секреты',
    path: ['JWT_REFRESH_SECRET'],
  });

export default registerAs('jwt', () => validateEnv(schema, process.env));
