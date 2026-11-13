import { verifyPassword } from '@/common/helpers/password';
import { Injectable } from '@nestjs/common';
import { CreateUserDto } from '@/modules/users/dto/create-user.dto';
import { UsersService } from '@/modules/users/users.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from '../token/token.service';
import { hashToken } from './helpers/hash-token';
import { AUTH_MESSAGES } from './constants/messages';
import { CurrentUserNotFoundError } from '@/modules/users/errors/user.errors';
import {
  InvalidCredentialsError,
  RefreshTokenInactiveError,
} from './errors/auth.errors';

export type TokenPair = {
  access_token: string;
  refresh_token: string;
};

export type AuthSession = {
  tokens: TokenPair;
  refreshExpiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: CreateUserDto): Promise<AuthSession> {
    const user = await this.usersService.create(dto);

    return this.startSession(user.id);
  }

  async login(login: string, password: string): Promise<AuthSession> {
    const user = await this.usersService.findAuthInfoByLogin(login);

    if (!user) {
      throw new InvalidCredentialsError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const isValidPassword = await verifyPassword(user.password_hash, password);

    if (!isValidPassword) {
      throw new InvalidCredentialsError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    return this.startSession(user.id);
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.findRefreshSession(refreshToken);

    await this.refreshTokensRepository.removeSession(
      session.user_id,
      session.session_id,
    );
  }

  async refreshTokens(refreshToken: string): Promise<AuthSession> {
    const { user_id: userId, session_id: sessionId } =
      await this.findRefreshSession(refreshToken);

    const user = await this.usersService.findOne(userId);

    if (!user) {
      throw new CurrentUserNotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    const { tokens, refreshExpiresAt } = await this.tokenService.generateTokens(
      userId,
      sessionId,
    );

    const rotated = await this.refreshTokensRepository.rotate({
      userId,
      sessionId,
      oldHash: hashToken(refreshToken),
      newHash: hashToken(tokens.refresh_token),
      expiresAt: refreshExpiresAt,
    });

    if (!rotated) {
      throw new RefreshTokenInactiveError(AUTH_MESSAGES.SESSION_EXPIRED);
    }

    return { tokens, refreshExpiresAt };
  }

  private async findRefreshSession(refreshToken: string) {
    const session = await this.refreshTokensRepository.findActiveByHash(
      hashToken(refreshToken),
    );

    if (!session) {
      throw new RefreshTokenInactiveError(AUTH_MESSAGES.SESSION_EXPIRED);
    }

    return session;
  }

  private async startSession(userId: number): Promise<AuthSession> {
    const { tokens, refreshExpiresAt, sessionId } =
      await this.tokenService.generateTokens(userId);

    const created = await this.refreshTokensRepository.create({
      userId,
      sessionId,
      tokenHash: hashToken(tokens.refresh_token),
      expiresAt: refreshExpiresAt,
    });

    if (!created) {
      throw new CurrentUserNotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    return { tokens, refreshExpiresAt };
  }
}
