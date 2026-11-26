import { Module } from '@nestjs/common';
import { S3Module } from '@/providers/files/s3/s3.module';
import { S3Service } from '@/providers/files/s3/s3.service';
import { FilesService } from './files.service';

@Module({
  imports: [S3Module],
  providers: [{ provide: FilesService, useClass: S3Service }],
  exports: [FilesService],
})
export class FilesModule {}
