import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { AppError } from '../errors';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof AppError) {
      return response.status(exception.status).json({
        statusCode: exception.status,
        error: exception.code,
        message: exception.messageAr,
        messageEn: exception.messageEn,
      });
    }

    if (exception instanceof ZodError) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: 400,
        error: 'VALIDATION_ERROR',
        message: 'البيانات المدخلة غير صحيحة',
        messageEn: 'Invalid input',
        details: exception.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return response.status(status).json({
        statusCode: status,
        error: 'HTTP_ERROR',
        message: typeof body === 'string' ? body : (body as { message?: string }).message,
        messageEn: exception.message,
      });
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
      `${request.method} ${request.url}`,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقع',
      messageEn: 'Unexpected error',
      ...(isProd ? {} : { debug: exception instanceof Error ? exception.message : String(exception) }),
    });
  }
}
