import { PasswordService } from '@/common/password/password.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from '@/modules/users/dto/create-user.dto';
import { UsersService } from '@/modules/users/users.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from './token.service';
import { hashToken } from './helpers/hash-token';
import { AUTH_MESSAGES } from './constants/messages';

export type TokenPair = {
  access_token: string;
  refresh_token: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
  ) {}

  async register(dto: CreateUserDto): Promise<TokenPair> {
    const user = await this.usersService.create(dto);

    return this.startSession(user.id);
  }

  async login(login: string, password: string): Promise<TokenPair> {
    const user = await this.usersService.findAuthInfoByLogin(login);

    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const isValidPassword = await this.passwordService.verify(
      user.password_hash,
      password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    return this.startSession(user.id);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokensRepository.removeByHash(hashToken(refreshToken));
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken);

    const user = await this.usersService.findOne(userId);

    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.USER_NOT_FOUND);
    }

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
        message: AUTH_MESSAGES.SESSION_EXPIRED,
      });
    }

    return tokens;
  }

  private async startSession(userId: number): Promise<TokenPair> {
    const { tokens, refreshExpiresAt } =
      await this.tokenService.generateTokens(userId);

    const created = await this.refreshTokensRepository.create(
      userId,
      hashToken(tokens.refresh_token),
      refreshExpiresAt,
    );

    if (!created) {
      throw new UnauthorizedException('Пользователь не существует');
    }

    return tokens;
  }
}
