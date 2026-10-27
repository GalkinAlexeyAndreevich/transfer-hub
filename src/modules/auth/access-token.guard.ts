import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AccessTokenPayload {
  sub: string;
  exp: number;
  iat?: number;
}

export type AuthUser = {
  id: number;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('Требуется Bearer-токен');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Токен недействителен или истёк');
    }

    const userId =
      typeof payload.sub === 'string' && /^[1-9]\d*$/.test(payload.sub)
        ? Number(payload.sub)
        : NaN;

    if (!Number.isSafeInteger(userId) || typeof payload.exp !== 'number') {
      throw new UnauthorizedException('Некорректные данные токена');
    }

    request.user = {
      id: userId,
    };

    return true;
  }
}
