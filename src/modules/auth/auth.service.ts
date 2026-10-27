import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UsersService } from '../users/users.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: CreateUserDto): Promise<TokenPair> {
    const user = await this.usersService.create(dto);

    return this.startSession(user.id);
  }

  async login(login: string, password: string): Promise<TokenPair> {
    const user = await this.usersRepository.findAuthInfoByLogin(login);

    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    return this.startSession(user.id);
  }

  private async startSession(userId: number): Promise<TokenPair> {
    const tokens = await this.generateTokens(userId);

    await this.refreshTokens.create(
      userId,
      hashToken(tokens.refresh_token),
      new Date(Date.now() + REFRESH_TTL_MS),
    );

    return tokens;
  }

  private async generateTokens(userId: number): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({
      sub: String(userId),
      type: 'access',
    });

    return {
      access_token: accessToken,
      refresh_token: randomBytes(32).toString('base64url'),
    };
  }
}
