import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { registerSchema, type RegisterDto } from './dto/register.dto';
import {
  refreshTokenSchema,
  type RefreshTokenDto,
} from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body({ schema: registerSchema }) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body({ schema: loginSchema }) dto: LoginDto) {
    return this.authService.login(dto.login, dto.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body({ schema: refreshTokenSchema }) dto: RefreshTokenDto) {
    await this.authService.logout(dto.refresh_token);

    return { message: 'Выход выполнен' };
  }

  @Post('refresh-token')
  refreshTokens(@Body({ schema: refreshTokenSchema }) dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refresh_token);
  }
}
