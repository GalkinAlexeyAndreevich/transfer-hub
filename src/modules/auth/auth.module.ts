import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenModule } from './token.module';
import { PasswordService } from 'src/common/password/password.service';

@Module({
  imports: [UsersModule, TokenModule, PasswordService],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokensRepository],
})
export class AuthModule {}
