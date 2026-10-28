import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UsersService } from '../users/users.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from './token.service';

export type TokenPair = {
  access_token: string;
  refresh_token: string;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: CreateUserDto): Promise<TokenPair> {
    const user = await this.usersService.create(dto);

    return this.startSession(user.id);
  }

  async login(login: string, password: string): Promise<TokenPair> {
    const user = await this.usersService.findAuthInfoByLogin(login);

    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    // TODO: Заменить на argon
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    return this.startSession(user.id);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokensRepository.removeByHash(hashToken(refreshToken));
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken);

    const { tokens, refreshExpiresAt } =
      await this.tokenService.generateTokens(userId);

    const rotated = await this.refreshTokensRepository.rotate(
      hashToken(refreshToken),
      userId,
      hashToken(tokens.refresh_token),
      refreshExpiresAt,
    );

    if (!rotated) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INACTIVE',
        message: 'Refresh token больше не активен',
      });
    }

    return tokens;
  }

  private async startSession(userId: number): Promise<TokenPair> {
    const { tokens, refreshExpiresAt } =
      await this.tokenService.generateTokens(userId);

    await this.refreshTokensRepository.create(
      userId,
      hashToken(tokens.refresh_token),
      refreshExpiresAt,
    );

    return tokens;
  }
}
