import { UsersService } from '@/modules/users/users.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokenService } from '../../token/token.service';
import { AUTH_MESSAGES } from '../constants/messages';
import { CurrentUserNotFoundError } from '@/modules/users/errors/user.errors';

export type AuthUser = {
  id: number;
};

export type AuthenticatedRequest = FastifyRequest & {
  user: AuthUser;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException(AUTH_MESSAGES.BEARER_TOKEN_REQUIRED);
    }

    const { userId } = await this.tokenService.verifyAccessToken(token);

    const user = await this.usersService.findOne(userId);

    if (!user) {
      throw new CurrentUserNotFoundError();
    }

    request.user = {
      id: userId,
    };

    return true;
  }
}
