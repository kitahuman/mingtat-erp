import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogsService } from '../error-logs/error-logs.service';

/**
 * 用戶資訊介面（從 JWT 解析的 request.user）
 */
interface JwtUser {
  sub: number;
  username: string;
  role: string;
}

/**
 * Global exception filter that:
 * 1. Hides stack traces in production
 * 2. Unifies error response format
 * 3. Logs all errors for debugging
 * 4. Records 500 errors to database and sends WhatsApp notifications
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(
    @Optional()
    @Inject(ErrorLogsService)
    private readonly errorLogsService?: ErrorLogsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = HttpStatus[status] || 'Error';
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string | string[]) || exception.message;
        error = (resp['error'] as string) || HttpStatus[status] || 'Error';
      } else {
        message = exception.message;
        error = HttpStatus[status] || 'Error';
      }
    } else {
      // Unhandled / unknown errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'An unexpected error occurred';
    }

    // Log the full error (including stack trace) for debugging
    const logMessage = `${request.method} ${request.url} → ${status}`;
    if (status >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : String(exception),
      );

      // 記錄到數據庫並發送 WhatsApp 通知
      if (this.errorLogsService) {
        const user = (request as Request & { user?: JwtUser }).user;
        const errorMsg = Array.isArray(message) ? message.join('; ') : message;
        const requestBody = request.body && typeof request.body === 'object'
          ? (request.body as Record<string, unknown>)
          : undefined;

        this.errorLogsService.logError({
          method: request.method,
          path: request.url,
          statusCode: status,
          message: exception instanceof Error ? exception.message : errorMsg,
          stack: exception instanceof Error ? exception.stack : undefined,
          userId: user?.sub,
          username: user?.username,
          requestBody,
        }).catch((err: Error) => {
          this.logger.error(`Failed to log error: ${err.message}`);
        });
      }
    } else {
      this.logger.warn(`${logMessage} — ${JSON.stringify(message)}`);
    }

    const isProduction = process.env.NODE_ENV === 'production';

    const body: Record<string, unknown> = {
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Include stack trace only in non-production environments
    if (!isProduction && exception instanceof Error) {
      body['stack'] = exception.stack;
    }

    response.status(status).json(body);
  }
}
