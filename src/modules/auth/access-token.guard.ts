import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from './token.service';

export type AuthUser = {
  id: number;
  jti: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('Требуется Bearer-токен');
    }

    const { userId, jti } = await this.tokenService.verifyAccessToken(token);

    request.user = {
      id: userId,
      jti,
    };

    return true;
  }
}
