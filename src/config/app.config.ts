import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { validateEnv } from './validate-env';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export default registerAs('app', () => {
  const env = validateEnv(schema, process.env);

  return {
    port: Number(env.PORT),
  };
});
