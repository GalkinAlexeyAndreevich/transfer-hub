export class UserAlreadyExistsError extends Error {
  override name = 'UserAlreadyExistsError';
}

export class UserNotFoundError extends Error {
  override name = 'UserNotFoundError';
}

export class ProfileAccessDeniedError extends Error {
  override name = 'ProfileAccessDeniedError';
}

export class CurrentUserNotFoundError extends Error {
  override name = 'CurrentUserNotFoundError';
}
