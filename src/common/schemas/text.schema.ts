import { z } from 'zod';

export const textSchema = z
  .string()
  .refine((value) => !value.includes('\u0000'), {
    error: 'Нулевой символ U+0000 запрещён',
  });
