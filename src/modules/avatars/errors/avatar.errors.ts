import { AVATAR_MESSAGES } from '../constants/messages';

export class AvatarNotFoundError extends Error {
  override name = 'AvatarNotFoundError';

  constructor(
    message: string = AVATAR_MESSAGES.AVATAR_NOT_FOUND,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class AvatarLimitExceededError extends Error {
  override name = 'AvatarLimitExceededError';

  constructor(
    message: string = AVATAR_MESSAGES.AVATAR_LIMIT_EXCEEDED,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class AvatarUploadFailedError extends Error {
  override name = 'AvatarUploadFailedError';

  constructor(
    message: string = AVATAR_MESSAGES.AVATAR_UPLOAD_FAILED,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
