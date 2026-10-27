import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { validateEnv } from './validate-env';

const schema = z.object({
  JWT_SECRET: z.string().min(32),
});

export default registerAs('jwt', () => {
  const env = validateEnv(schema, process.env);

  return {
    JWT_SECRET: env.JWT_SECRET,
  };
});
