import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const response = context.getResponse<FastifyReply>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = 'INTERNAL_SERVER_ERROR';
    let message = ['Внутренняя ошибка сервера'];

    if (exception instanceof HttpException && statusCode < 500) {
      const body = exception.getResponse();

      code = `HTTP_${statusCode}`;

      const rawMessage: unknown =
        typeof body === 'string'
          ? body
          : 'message' in body
            ? body.message
            : exception.message;

      message =
        typeof rawMessage === 'string'
          ? [rawMessage]
          : Array.isArray(rawMessage)
            ? rawMessage.filter(
                (item: unknown): item is string => typeof item === 'string',
              )
            : ['Ошибка запроса'];

      if (
        typeof body === 'object' &&
        'code' in body &&
        typeof body.code === 'string'
      ) {
        code = body.code;
      }
    }

    if (statusCode >= 500) {
      this.logger.error(exception);
    }

    if (response.sent || response.raw.headersSent) {
      return;
    }

    response.status(statusCode).send({
      statusCode,
      code,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
