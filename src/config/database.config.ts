import { registerAs } from '@nestjs/config';
import z from 'zod';
import { validateEnv } from './validate-env';

const schema = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
  }),
});

export default registerAs('database', () => {
  const env = validateEnv(schema, process.env);

  return {
    url: env.DATABASE_URL,
  };
});
