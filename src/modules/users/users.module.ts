import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../../database/database.module';
import { TokenModule } from '../auth/token.module';

@Module({
  imports: [DatabaseModule, TokenModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
