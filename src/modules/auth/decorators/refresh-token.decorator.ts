import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { RefreshTokenInactiveError } from '../errors/auth.errors';
import type { FastifyRequest } from 'fastify';
import { REFRESH_TOKEN_COOKIE } from '../constants/auth.constants';

export const RefreshToken = createParamDecorator<undefined, string>(
  (_data, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies[REFRESH_TOKEN_COOKIE];

    if (!token) {
      throw new RefreshTokenInactiveError();
    }

    return token;
  },
);
