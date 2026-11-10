import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../token/token.service';

describe('TokenService', () => {
  const config = {
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    ACCESS_TTL_SECONDS: 900,
    REFRESH_TTL_SECONDS: 2_592_000,
  };
  const jwt = new JwtService();
  const service = new TokenService(jwt, config);

  it('сохраняет sid при ротации и меняет сам refresh-токен', async () => {
    const initial = await service.generateTokens(1);
    const rotated = await service.generateTokens(1, initial.sessionId);

    expect(rotated.tokens.refresh_token).not.toBe(initial.tokens.refresh_token);
    await expect(
      service.verifyRefreshToken(rotated.tokens.refresh_token),
    ).resolves.toMatchObject({ userId: 1, sessionId: initial.sessionId });
  });

  it('создаёт разные sid для независимых входов', async () => {
    const [first, second] = await Promise.all([
      service.generateTokens(1),
      service.generateTokens(1),
    ]);

    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it.each([undefined, null, '', 'not-a-uuid'])(
    'отклоняет refresh с некорректным sid: %p',
    async (sid) => {
      const token = jwt.sign(
        { sub: '1', type: 'refresh', jti: 'test', sid },
        { secret: config.JWT_REFRESH_SECRET, expiresIn: 60 },
      );

      await expect(service.verifyRefreshToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    },
  );

  it('не позволяет взаимозаменять access и refresh', async () => {
    const { tokens } = await service.generateTokens(1);

    await expect(
      service.verifyRefreshToken(tokens.access_token),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.verifyAccessToken(tokens.refresh_token),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
