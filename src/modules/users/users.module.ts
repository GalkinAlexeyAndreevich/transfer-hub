import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../../database/database.module';
import { TokenModule } from '../auth/token.module';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PasswordService } from 'src/common/password/password.service';

@Module({
  imports: [DatabaseModule, TokenModule, PasswordService],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, AccessTokenGuard],
  exports: [UsersService, AccessTokenGuard],
})
export class UsersModule {}
