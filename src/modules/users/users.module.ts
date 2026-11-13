import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';
import { TokenModule } from '@/modules/token/token.module';
import { SessionsModule } from '@/modules/sessions/sessions.module';

@Module({
  imports: [TokenModule, SessionsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
