import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

import { getTraceId } from '@/common/middlewares/trace-id.middleware';

/**
 * convention.md 8.3 — 모든 API 요청의 종료를 인터셉터에서 일괄로 남긴다.
 * 요청 바디는 남기지 않는다 (convention.md 8.4).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.logCompleted(request, response.statusCode, startedAt),
        error: (error: unknown) =>
          this.logCompleted(request, this.resolveStatus(error), startedAt),
      }),
    );
  }

  private resolveStatus(error: unknown): number {
    return error instanceof HttpException
      ? error.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private logCompleted(
    request: Request,
    status: number,
    startedAt: bigint,
  ): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    this.logger.log('request completed', {
      trace_id: getTraceId(request),
      method: request.method,
      path: request.url,
      status,
      duration_ms: Math.round(durationMs),
    });
  }
}
