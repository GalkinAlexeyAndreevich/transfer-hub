import { Test, TestingModule } from '@nestjs/testing';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const adapter = new FastifyAdapter();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(adapter);
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    await adapter.getInstance().ready();
  });

  it('/ (GET)', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Hello World!');
  });

  afterAll(async () => {
    await app.close();
  });
});
