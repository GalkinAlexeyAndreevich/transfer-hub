import { z } from 'zod';
import { ID_LIMITS, INVALID_ID_MESSAGE } from '../constants/id.constants';

export const idSchema = z.coerce
  .number({ error: INVALID_ID_MESSAGE })
  .int({ error: INVALID_ID_MESSAGE })
  .min(ID_LIMITS.MIN, { error: INVALID_ID_MESSAGE })
  .max(ID_LIMITS.MAX, { error: INVALID_ID_MESSAGE });
