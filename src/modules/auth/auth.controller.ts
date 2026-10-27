import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { registerSchema, type RegisterDto } from './dto/register.dto';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';

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

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.me(request.user.id);
  }
}
