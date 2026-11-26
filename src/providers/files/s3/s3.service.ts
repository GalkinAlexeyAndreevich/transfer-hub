import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { FilesService } from '@/providers/files/files.service';

export const S3_BUCKET = Symbol('S3_BUCKET');

@Injectable()
export class S3Service implements FilesService, OnModuleDestroy {
  constructor(
    private readonly client: S3Client,
    @Inject(S3_BUCKET) private readonly bucket: string,
  ) {}

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
