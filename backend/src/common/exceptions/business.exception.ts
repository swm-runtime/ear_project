import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode } from './error-code.enum';

export type ErrorLogLevel = 'info' | 'warn' | 'error';

export interface BusinessExceptionOptions {
  status: HttpStatus;
  errorCode: ErrorCode;
  /** 사용자 노출용 문구. 내부 사유·스택·테이블명·쿼리를 담지 않는다 (architecture.md 7.4) */
  message: string;
  retryable?: boolean;
  retryAfterSec?: number;
  logLevel?: ErrorLogLevel;
}

/**
 * architecture.md 7.2 — 우리가 던지는 모든 도메인 예외의 부모.
 * Service가 도메인 판정 결과로 던지고, 전역 Exception Filter가 응답 규격으로 변환한다.
 */
export class BusinessException extends HttpException {
  readonly errorCode: ErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSec?: number;
  readonly logLevel: ErrorLogLevel;

  constructor(options: BusinessExceptionOptions) {
    super(options.message, options.status);
    this.errorCode = options.errorCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterSec = options.retryAfterSec;
    this.logLevel = options.logLevel ?? 'warn';
  }
}

/** 하위 예외가 상태 코드만 고정하고 나머지는 그대로 받도록 하는 옵션 */
export type DomainExceptionOptions = Omit<BusinessExceptionOptions, 'status'>;
