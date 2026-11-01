import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@/modules/users/users.module';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenModule } from './token.module';
import { PasswordService } from '@/common/password/password.service';

@Module({
  imports: [UsersModule, TokenModule],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokensRepository, PasswordService],
})
export class AuthModule {}
