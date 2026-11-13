import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../token/token.service';
import { InvalidTokenError } from './errors/token.errors';

describe('TokenService', () => {
  const config = {
    JWT_SECRET: 'a'.repeat(64),
    ACCESS_TTL_SECONDS: 900,
    REFRESH_TTL_SECONDS: 2_592_000,
  };
  const jwt = new JwtService();
  const service = new TokenService(jwt, config);

  it('сохраняет sid при ротации и меняет сам refresh-токен', async () => {
    const initial = await service.generateTokens(1);
    const rotated = await service.generateTokens(1, initial.sessionId);

    expect(rotated.sessionId).toBe(initial.sessionId);
    expect(initial.tokens.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(initial.tokens.refresh_token, 'base64url')).toHaveLength(
      32,
    );
    expect(rotated.tokens.refresh_token).not.toBe(initial.tokens.refresh_token);
    await expect(
      service.verifyAccessToken(rotated.tokens.access_token),
    ).resolves.toMatchObject({ userId: 1 });
  });

  it('создаёт разные sid для независимых входов', async () => {
    const [first, second] = await Promise.all([
      service.generateTokens(1),
      service.generateTokens(1),
    ]);

    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it('задаёт срок refresh по конфигурации', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { refreshExpiresAt } = await service.generateTokens(1);

    expect(refreshExpiresAt.getTime()).toBeGreaterThanOrEqual(
      (now + config.REFRESH_TTL_SECONDS) * 1000,
    );
    expect(refreshExpiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + config.REFRESH_TTL_SECONDS * 1000,
    );
  });

  it.each([undefined, null, '', 'refresh'])(
    'отклоняет access с некорректным типом: %p',
    async (type) => {
      const token = jwt.sign(
        { sub: '1', type, jti: 'test' },
        { secret: config.JWT_SECRET, expiresIn: 60 },
      );

      await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    },
  );

  it('отклоняет refresh вместо access', async () => {
    const { tokens } = await service.generateTokens(1);

    await expect(
      service.verifyAccessToken(tokens.refresh_token),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
