import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@/modules/users/users.module';
import { SessionsModule } from '@/modules/sessions/sessions.module';
import { TokenModule } from '../token/token.module';

@Module({
  imports: [UsersModule, TokenModule, SessionsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
