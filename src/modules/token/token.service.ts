import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '@/config/jwt.config';
import { randomBytes, randomUUID } from 'node:crypto';
import { InvalidTokenError } from './errors/token.errors';

export type VerifiedToken = {
  userId: number;
  jti: string;
};

export type TokenPayload = Record<string, unknown>;

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

    const accessToken = await this.jwt.signAsync(
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
    );
    const refreshToken = randomBytes(32).toString('base64url');

    return {
      sessionId,
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
      },
      refreshExpiresAt: new Date(refreshExp * 1000),
    };
  }

  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    let payload: TokenPayload;

    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: this.config.JWT_SECRET,
        algorithms: ['HS256'],
      });
    } catch (error: unknown) {
      throw new InvalidTokenError('Access token недействителен или истёк', {
        cause: error,
      });
    }

    const invalidPayloadMessage = 'Некорректный access token';

    if (!payload) {
      throw new InvalidTokenError(invalidPayloadMessage);
    }

    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !Number.isFinite(payload.exp) ||
      typeof payload.jti !== 'string' ||
      !payload.jti
    ) {
      throw new InvalidTokenError(invalidPayloadMessage);
    }

    const userId = Number(payload.sub);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new InvalidTokenError(invalidPayloadMessage);
    }

    return {
      userId,
      jti: payload.jti,
    };
  }
}
