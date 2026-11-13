import { AUTH_MESSAGES } from '../constants/messages';

export class InvalidCredentialsError extends Error {
  override name = 'InvalidCredentialsError';

  constructor(
    message: string = AUTH_MESSAGES.INVALID_CREDENTIALS,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class RefreshTokenInactiveError extends Error {
  override name = 'RefreshTokenInactiveError';

  constructor(
    message: string = AUTH_MESSAGES.SESSION_EXPIRED,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
