import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3Module } from '../src/providers/files/s3/s3.module';
import { S3_BUCKET } from '../src/providers/files/s3/s3.service';

async function createBucket() {
  const app = await NestFactory.createApplicationContext(S3Module, {
    logger: false,
    abortOnError: false,
  });

  try {
    const bucket = app.get<string>(S3_BUCKET);
    try {
      await app.get(S3Client).send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error: unknown) {
      if (!(error instanceof BucketAlreadyOwnedByYou)) throw error;
    }
    console.info(`S3 bucket ${bucket} is ready`);
  } finally {
    await app.close();
  }
}

createBucket().catch(() => {
  console.error('S3 bucket initialization failed');
  process.exitCode = 1;
});
