import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../../database/database.module';
import { TokenModule } from '../auth/token.module';
import { AccessTokenGuard } from '../auth/access-token.guard';

@Module({
  imports: [DatabaseModule, TokenModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, AccessTokenGuard],
  exports: [UsersService, AccessTokenGuard],
})
export class UsersModule {}
