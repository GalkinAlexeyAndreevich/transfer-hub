import { USER_MESSAGES } from '../constants/messages';

export class UserAlreadyExistsError extends Error {
  override name = 'UserAlreadyExistsError';

  constructor(
    message: string = USER_MESSAGES.USER_ALREADY_EXISTS,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class UserNotFoundError extends Error {
  override name = 'UserNotFoundError';

  constructor(
    message: string = USER_MESSAGES.USER_NOT_FOUND,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class ProfileAccessDeniedError extends Error {
  override name = 'ProfileAccessDeniedError';

  constructor(
    message: string = USER_MESSAGES.PROFILE_ACCESS_DENIED,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class CurrentUserNotFoundError extends Error {
  override name = 'CurrentUserNotFoundError';

  constructor(
    message: string = USER_MESSAGES.USER_NOT_FOUND,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
