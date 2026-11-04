import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import appConfig from '@/config/app.config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  app.enableShutdownHooks();
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Transfer Hub API')
    .setDescription('API пользователей и авторизации')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(config.port);
}

bootstrap().catch((error: unknown) => {
  console.error('Не удалось запустить приложение:', error);
  process.exit(1);
});
