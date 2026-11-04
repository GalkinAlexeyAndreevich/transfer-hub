import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '@/config/jwt.config';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AUTH_MESSAGES } from './constants/messages';

type TokenType = 'access' | 'refresh';

export type VerifiedToken = {
  userId: number;
  jti: string;
};

export type VerifiedRefreshToken = VerifiedToken & {
  sessionId: string;
};

export type TokenPayload = Record<string, unknown>;

const sessionIdSchema = z.uuid();

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly config: ConfigType<typeof jwtConfig>,
  ) {}

  async generateTokens(userId: number, sessionId: string = randomUUID()) {
    const now = Math.floor(Date.now() / 1000);
    const refreshExp = now + this.config.REFRESH_TTL_SECONDS;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        {
          sub: String(userId),
          type: 'access',
          jti: randomUUID(),
          iat: now,
        },
        {
          secret: this.config.JWT_SECRET,
          algorithm: 'HS256',
          expiresIn: this.config.ACCESS_TTL_SECONDS,
        },
      ),
      this.jwt.signAsync(
        {
          sub: String(userId),
          type: 'refresh',
          sid: sessionId,
          jti: randomUUID(),
          iat: now,
          exp: refreshExp,
        },
        {
          secret: this.config.JWT_REFRESH_SECRET,
          algorithm: 'HS256',
        },
      ),
    ]);

    return {
      sessionId,
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
      },
      refreshExpiresAt: new Date(refreshExp * 1000),
    };
  }

  verifyAccessToken(token: string): Promise<VerifiedToken> {
    return this.verifyToken(token, 'access');
  }

  verifyRefreshToken(token: string): Promise<VerifiedRefreshToken> {
    return this.verifyToken(token, 'refresh');
  }

  private verifyToken(
    token: string,
    expectedType: 'access',
  ): Promise<VerifiedToken>;
  private verifyToken(
    token: string,
    expectedType: 'refresh',
  ): Promise<VerifiedRefreshToken>;
  private async verifyToken(
    token: string,
    expectedType: TokenType,
  ): Promise<VerifiedToken | VerifiedRefreshToken> {
    let payload: TokenPayload;

    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret:
          expectedType === 'access'
            ? this.config.JWT_SECRET
            : this.config.JWT_REFRESH_SECRET,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException(
        expectedType === 'access'
          ? 'Access token недействителен или истёк'
          : 'Refresh token недействителен или истёк',
      );
    }

    const invalidPayloadMessage =
      expectedType === 'access'
        ? 'Некорректный access token'
        : 'Некорректный refresh token';

    if (!payload) {
      throw new UnauthorizedException(invalidPayloadMessage);
    }

    if (
      payload.type !== expectedType ||
      typeof payload.sub !== 'string' ||
      !Number.isFinite(payload.exp) ||
      typeof payload.jti !== 'string' ||
      !payload.jti
    ) {
      throw new UnauthorizedException(invalidPayloadMessage);
    }

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new UnauthorizedException(invalidPayloadMessage);
    }

    if (expectedType === 'refresh') {
      const sessionId = sessionIdSchema.safeParse(payload.sid);

      if (!sessionId.success) {
        throw new UnauthorizedException(AUTH_MESSAGES.SESSION_EXPIRED);
      }

      return { userId, jti: payload.jti, sessionId: sessionId.data };
    }

    return {
      userId,
      jti: payload.jti,
    };
  }
}
