import { verifyPassword } from '@/common/helpers/password';
import { Injectable } from '@nestjs/common';
import { CreateUserDto } from '@/modules/users/dto/create-user.dto';
import { UsersService } from '@/modules/users/users.service';
import { UsersRepository } from '@/modules/users/users.repository';
import { RefreshTokensRepository } from '@/modules/sessions/refresh-tokens.repository';
import { DatabaseService } from '@/database/database.service';
import { TokenService } from '../token/token.service';
import { hashToken } from './helpers/hash-token';
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
    private readonly usersRepository: UsersRepository,
    private readonly database: DatabaseService,
  ) {}

  async register(dto: CreateUserDto): Promise<AuthSession> {
    const user = await this.usersService.create(dto);

    return this.startSession(user.id);
  }

  async login(login: string, password: string): Promise<AuthSession> {
    const user = await this.usersService.findAuthInfoByLogin(login);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isValidPassword = await verifyPassword(user.password_hash, password);

    if (!isValidPassword) {
      throw new InvalidCredentialsError();
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
      throw new CurrentUserNotFoundError();
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
      throw new RefreshTokenInactiveError();
    }

    return { tokens, refreshExpiresAt };
  }

  private async findRefreshSession(refreshToken: string) {
    const session = await this.refreshTokensRepository.findActiveByHash(
      hashToken(refreshToken),
    );

    if (!session) {
      throw new RefreshTokenInactiveError();
    }

    return session;
  }

  private async startSession(userId: number): Promise<AuthSession> {
    const { tokens, refreshExpiresAt, sessionId } =
      await this.tokenService.generateTokens(userId);

    await this.database.db.transaction().execute(async (trx) => {
      const user = await this.usersRepository.findOneForUpdate(userId, trx);

      if (!user) {
        throw new CurrentUserNotFoundError();
      }

      await this.refreshTokensRepository.create(
        {
          userId,
          sessionId,
          tokenHash: hashToken(tokens.refresh_token),
          expiresAt: refreshExpiresAt,
        },
        trx,
      );
    });

    return { tokens, refreshExpiresAt };
  }
}
