import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';
import { AuthService, type AuthSession } from './auth.service';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { registerSchema, type RegisterDto } from './dto/register.dto';
import { AUTH_MESSAGES } from './constants/messages';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RefreshToken } from './decorators/refresh-token.decorator';
import { REFRESH_TOKEN_COOKIE } from './constants/auth.constants';

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
      `возвращает access_token и устанавливает ${REFRESH_TOKEN_COOKIE} в HttpOnly cookie.`,
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
    description: `Проверяет логин и пароль, возвращает access_token и устанавливает ${REFRESH_TOKEN_COOKIE} в HttpOnly cookie.`,
  })
  @ApiCreatedResponse({ description: 'Вход выполнен, токены выданы' })
  @ApiUnauthorizedResponse({ description: AUTH_MESSAGES.INVALID_CREDENTIALS })
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
    @RefreshToken() refreshToken: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.authService.logout(refreshToken);
    reply.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions);

    return { message: 'Выход выполнен' };
  }

  @Post('refresh-token')
  @ApiCookieAuth()
  async refreshTokens(
    @RefreshToken() refreshToken: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.authService.refreshTokens(refreshToken);

    return this.setRefreshCookie(reply, session);
  }

  private setRefreshCookie(
    reply: FastifyReply,
    { tokens, refreshExpiresAt }: AuthSession,
  ) {
    reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refresh_token, {
      ...refreshCookieOptions,
      expires: refreshExpiresAt,
    });

    return { access_token: tokens.access_token };
  }
}
