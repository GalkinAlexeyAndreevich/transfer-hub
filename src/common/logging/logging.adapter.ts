import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { CLS_ID, ClsServiceManager } from 'nestjs-cls';

const requestIdHeader = 'x-request-id';

export function createLoggingAdapter(): FastifyAdapter {
  const cls = ClsServiceManager.getClsService();
  const adapter = new FastifyAdapter({
    requestIdHeader: false,
    genReqId: (request: IncomingMessage) =>
      request.headers[requestIdHeader]?.toString() || randomUUID(),
  });
  const fastify = adapter.getInstance();

  fastify.addHook('onRequest', (request, reply, done) => {
    reply.header(requestIdHeader, request.id);
    cls.runWith({ [CLS_ID]: request.id }, done);
  });

  return adapter;
}
