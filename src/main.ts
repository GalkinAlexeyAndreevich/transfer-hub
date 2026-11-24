import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import appConfig from '@/config/app.config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookie from '@fastify/cookie';
import { Logger } from 'nestjs-pino';
import { createLoggingAdapter } from '@/common/logging/logging.adapter';
import { logger } from '@/common/logging/logger';
import { REFRESH_TOKEN_COOKIE } from '@/modules/auth/constants/auth.constants';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createLoggingAdapter(),
    { bufferLogs: true, autoFlushLogs: false, abortOnError: false },
  );
  app.useLogger(app.get(Logger));
  app.flushLogs();
  await app.register(cookie);
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  app.enableShutdownHooks();
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Transfer Hub API')
    .setDescription('API пользователей и авторизации')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(REFRESH_TOKEN_COOKIE)
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(config.port);
  logger.info(
    { event: 'app.started', port: config.port },
    'Application started',
  );
}

bootstrap().catch(() => {
  logger.fatal({ event: 'app.start_failed' }, 'Application startup failed');
  process.exit(1);
});
