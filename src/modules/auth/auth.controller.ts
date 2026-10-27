import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { registerSchema, type registerDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body({ schema: registerSchema }) dto: registerDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body({ schema: loginSchema }) dto: LoginDto) {
    return this.authService.login(dto.login, dto.password);
  }
}
