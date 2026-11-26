import { randomUUID } from 'node:crypto';
import type { LightMyRequestResponse } from 'fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { TokenPair } from '@/modules/auth/auth.service';
import { REFRESH_TOKEN_COOKIE } from '@/modules/auth/constants/auth.constants';

export async function register(app: NestFastifyApplication) {
  const login = `u-${randomUUID()}`;
  const user = {
    login,
    email: `${login}@example.com`,
    password: 'ExamplePassword123!',
    age: 25,
  };
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: user,
  });
  expect(response.statusCode).toBe(201);

  return { user, tokens: readTokens(response) };
}

export function readTokens(response: LightMyRequestResponse): TokenPair {
  const tokens = response.json<{ access_token: string }>();
  expect(Object.keys(tokens)).toEqual(['access_token']);
  expect(typeof tokens.access_token).toBe('string');
  const refreshCookie = response.cookies.find(
    (cookie) => cookie.name === REFRESH_TOKEN_COOKIE,
  );
  expect(refreshCookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/auth',
  });
  expect(refreshCookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(refreshCookie?.expires).toBeInstanceOf(Date);

  return { ...tokens, refresh_token: refreshCookie!.value };
}

export function refresh(app: NestFastifyApplication, token: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/refresh-token',
    cookies: { [REFRESH_TOKEN_COOKIE]: token },
  });
}

export function logout(app: NestFastifyApplication, token: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/logout',
    cookies: { [REFRESH_TOKEN_COOKIE]: token },
  });
}

export type RegisteredUser = Awaited<ReturnType<typeof register>>;
