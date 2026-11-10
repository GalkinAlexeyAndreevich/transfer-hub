export class InvalidCredentialsError extends Error {
  override name = 'InvalidCredentialsError';
}

export class RefreshTokenInactiveError extends Error {
  override name = 'RefreshTokenInactiveError';
}
