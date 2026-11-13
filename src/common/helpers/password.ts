import * as argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  if (!passwordHash.startsWith('$argon2id')) {
    return Promise.resolve(false);
  }

  return argon2.verify(passwordHash, password);
}
