import type { Params } from 'nestjs-pino';
import pino from 'pino';

const secretFields = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'token_hash',
  'accessToken',
  'refreshToken',
  'refresh_token',
  'key',
  'apiKey',
  'privateKey',
  'secret',
  'authorization',
  'Authorization',
  'cookie',
  'cookies',
  'headers',
  'body',
  'err',
];

export const logger = pino({
  level: 'info',
  redact: {
    remove: true,
    paths: [
      ...secretFields.flatMap((key) => [key, `*.${key}`]),
      'req.url',
      'req.query',
    ],
  },
});

export const loggerConfig: Params = {
  pinoHttp: {
    logger,
    customProps: (request) => ({ requestId: request.id }),
    customLogLevel: (_request, response, error) => {
      if (error || response.statusCode >= 500) return 'error';
      if (response.statusCode >= 400) return 'warn';
      return 'info';
    },
  },
};
