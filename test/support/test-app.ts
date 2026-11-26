import cookie from '@fastify/cookie';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import databaseConfig from '@/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { createTestDatabase, type TestDatabase } from './test-database';

export async function createTestApp() {
  let testDatabase: TestDatabase | undefined;
  let module: TestingModule | undefined;
  let app: NestFastifyApplication | undefined;

  async function close() {
    try {
      if (app) {
        await app.close();
      } else {
        await module?.close();
      }
    } finally {
      await testDatabase?.close();
    }
  }

  try {
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useFactory({
        inject: [databaseConfig.KEY],
        factory: async (config: ConfigType<typeof databaseConfig>) => {
          testDatabase = await createTestDatabase(config.url);
          return { db: testDatabase.database };
        },
      })
      .compile();

    const adapter = new FastifyAdapter();
    app = module.createNestApplication<NestFastifyApplication>(adapter, {
      logger: false,
    });
    await app.register(cookie);
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    await adapter.getInstance().ready();

    return {
      app,
      database: app.get<DatabaseService>(DatabaseService).db,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
