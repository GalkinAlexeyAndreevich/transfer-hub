import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import s3Config from '@/config/s3.config';
import { S3_BUCKET } from './s3.service';

@Module({
  imports: [ConfigModule.forFeature(s3Config)],
  providers: [
    {
      provide: S3Client,
      inject: [s3Config.KEY],
      useFactory: (config: ConfigType<typeof s3Config>) =>
        new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }),
    },
    {
      provide: S3_BUCKET,
      inject: [s3Config.KEY],
      useFactory: (config: ConfigType<typeof s3Config>) => config.bucket,
    },
  ],
  exports: [S3Client, S3_BUCKET],
})
export class S3Module {}
