import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService, type AuthSession } from './auth.service';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { registerSchema, type RegisterDto } from './dto/register.dto';
import { RefreshTokenInactiveError } from './errors/auth.errors';
import { AUTH_MESSAGES } from './constants/messages';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

const refreshCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auth',
} satisfies CookieSerializeOptions;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Регистрация аккаунта',
    description:
      'Создаёт пользователя и сразу открывает сессию: ' +
      'возвращает access_token и устанавливает refresh_token в HttpOnly cookie.',
  })
  async register(
    @Body({ schema: registerSchema }) dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.authService.register(dto);

    return this.setRefreshCookie(reply, session);
  }

  @ApiOperation({
    summary: 'Вход в аккаунт',
    description:
      'Проверяет логин и пароль, возвращает access_token и устанавливает refresh_token в HttpOnly cookie.',
  })
  @ApiCreatedResponse({ description: 'Вход выполнен, токены выданы' })
  @ApiUnauthorizedResponse({ description: 'Неверный логин или пароль' })
  @Post('login')
  async login(
    @Body({ schema: loginSchema }) dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.authService.login(dto.login, dto.password);

    return this.setRefreshCookie(reply, session);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.clearCookie('refresh_token', refreshCookieOptions);
    await this.authService.logout(this.getRefreshToken(request));

    return { message: 'Выход выполнен' };
  }

  @Post('refresh-token')
  @ApiCookieAuth()
  async refreshTokens(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.authService.refreshTokens(
      this.getRefreshToken(request),
    );

    return this.setRefreshCookie(reply, session);
  }

  private getRefreshToken(request: FastifyRequest): string {
    const refreshToken = request.cookies.refresh_token;

    if (!refreshToken) {
      throw new RefreshTokenInactiveError(AUTH_MESSAGES.SESSION_EXPIRED);
    }

    return refreshToken;
  }

  private setRefreshCookie(
    reply: FastifyReply,
    { tokens, refreshExpiresAt }: AuthSession,
  ) {
    reply.setCookie('refresh_token', tokens.refresh_token, {
      ...refreshCookieOptions,
      expires: refreshExpiresAt,
    });

    return { access_token: tokens.access_token };
  }
}
