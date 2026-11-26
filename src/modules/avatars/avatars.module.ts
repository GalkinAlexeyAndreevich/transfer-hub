import { Module } from '@nestjs/common';
import { TokenModule } from '@/modules/token/token.module';
import { UsersModule } from '@/modules/users/users.module';
import { FilesModule } from '@/providers/files/files.module';
import { AvatarsController } from './avatars.controller';
import { AvatarsRepository } from './avatars.repository';
import { AvatarsService } from './avatars.service';
import { AvatarFilePipe } from './pipes/avatar-file.pipe';

@Module({
  imports: [UsersModule, TokenModule, FilesModule],
  controllers: [AvatarsController],
  providers: [AvatarsService, AvatarsRepository, AvatarFilePipe],
})
export class AvatarsModule {}
