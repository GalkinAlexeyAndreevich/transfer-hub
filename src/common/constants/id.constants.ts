export const ID_LIMITS = {
  MIN: 1,
  MAX: 2_147_483_647,
} as const;

export const INVALID_ID_MESSAGE = `ID должен быть целым числом от ${ID_LIMITS.MIN} до ${ID_LIMITS.MAX}`;
