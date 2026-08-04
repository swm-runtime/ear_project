import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import {
  BusinessException,
  ErrorLogLevel,
} from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { getTraceId } from '@/common/middlewares/trace-id.middleware';

/** architecture.md 7.4 — 클라이언트가 받는 에러 응답 규격 (`common-error-handling.md` 6장 ApiError + trace_id) */
export interface ApiErrorResponse {
  error_code: ErrorCode;
  message: string;
  retryable: boolean;
  retry_after_sec: number | null;
  trace_id: string | null;
}

interface MappedError {
  status: number;
  body: ApiErrorResponse;
  logLevel: ErrorLogLevel;
}

/** 예상하지 못한 5xx는 항상 이 문구로 고정한다. 내부 정보 유출 방지 (architecture.md 7.4) */
const INTERNAL_ERROR_MESSAGE =
  '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요';

/** 프레임워크가 던진 HttpException을 사용자 노출 문구로 바꾼다. 원본 메시지는 로그에만 남긴다 */
const STATUS_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: INTERNAL_ERROR_MESSAGE,
  [HttpStatus.UNAUTHORIZED]: '로그인이 필요해요',
  [HttpStatus.FORBIDDEN]: '접근 권한이 없어요',
  [HttpStatus.NOT_FOUND]: '찾을 수 없어요',
  [HttpStatus.CONFLICT]: '이미 처리된 요청이에요',
  [HttpStatus.TOO_MANY_REQUESTS]: '요청이 많아요. 잠시 후 다시 시도해주세요',
};

/** HttpException이 돌려주는 status는 number이므로 비교 대상도 number로 고정한다 */
const SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;
const TOO_MANY_REQUESTS_STATUS: number = HttpStatus.TOO_MANY_REQUESTS;

const STATUS_ERROR_CODES: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

/**
 * architecture.md 7.1 — 에러 변환은 이 한 곳에서만 한다. Controller는 try/catch 하지 않는다.
 * 예외 로그도 여기서 한 번만 남긴다 (convention.md 8.5 중복 로깅 금지).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const traceId = getTraceId(request);

    const mapped = this.mapException(exception, traceId);

    this.log(mapped, request, exception);
    response.status(mapped.status).json(mapped.body);
  }

  private mapException(
    exception: unknown,
    traceId: string | null,
  ): MappedError {
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        logLevel: exception.logLevel,
        body: {
          error_code: exception.errorCode,
          message: exception.message,
          retryable: exception.retryable,
          retry_after_sec: exception.retryAfterSec ?? null,
          trace_id: traceId,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const isServerError = status >= SERVER_ERROR_STATUS;

      return {
        status,
        logLevel: isServerError ? 'error' : 'warn',
        body: {
          error_code: isServerError
            ? ErrorCode.INTERNAL_ERROR
            : (STATUS_ERROR_CODES[status] ?? ErrorCode.VALIDATION_FAILED),
          message: isServerError
            ? INTERNAL_ERROR_MESSAGE
            : (STATUS_MESSAGES[status] ?? '문제가 발생했어요'),
          retryable: isServerError || status === TOO_MANY_REQUESTS_STATUS,
          retry_after_sec: null,
          trace_id: traceId,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      logLevel: 'error',
      body: {
        error_code: ErrorCode.INTERNAL_ERROR,
        message: INTERNAL_ERROR_MESSAGE,
        retryable: true,
        retry_after_sec: null,
        trace_id: traceId,
      },
    };
  }

  private log(mapped: MappedError, request: Request, exception: unknown): void {
    const fields = {
      trace_id: mapped.body.trace_id,
      method: request.method,
      path: request.url,
      status: mapped.status,
      error_code: mapped.body.error_code,
    };

    if (mapped.logLevel === 'error') {
      // 스택은 error 레벨에서만 남긴다 (architecture.md 7.6)
      this.logger.error(
        'request failed',
        exception instanceof Error ? exception.stack : String(exception),
        JSON.stringify(fields),
      );
      return;
    }

    const message =
      exception instanceof Error ? exception.message : 'request failed';

    if (mapped.logLevel === 'info') {
      this.logger.log(message, fields);
      return;
    }

    this.logger.warn(message, fields);
  }
}
