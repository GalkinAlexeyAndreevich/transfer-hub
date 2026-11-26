import { MAX_ACTIVE_AVATARS } from './avatar.constants';

export const AVATAR_MESSAGES = {
  AVATAR_NOT_FOUND: 'Аватар не найден',
  AVATAR_LIMIT_EXCEEDED: `Можно загрузить не больше ${MAX_ACTIVE_AVATARS} активных аватаров`,
  AVATAR_UPLOAD_FAILED: 'Не удалось загрузить аватар',
} as const;
