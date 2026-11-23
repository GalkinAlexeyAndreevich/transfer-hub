import { TOKEN_MESSAGES } from '../constants/messages';

export class InvalidTokenError extends Error {
  override name = 'InvalidTokenError';

  constructor(
    message: string = TOKEN_MESSAGES.INVALID_ACCESS_TOKEN,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
