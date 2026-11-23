import { z } from 'zod';

export function validateEnv<T extends z.ZodType>(
  schema: T,
  env: NodeJS.ProcessEnv,
): z.output<T> {
  const result = schema.safeParse(env);

  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}
