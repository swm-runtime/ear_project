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
  /**
   * 에러 응답 본문에 함께 실을 추가 필드.
   * 클라이언트 계약이 규격 밖 필드를 요구할 때만 쓴다
   * (예: `EMAIL_VERIFICATION_CODE_MISMATCH`의 `attempts_remaining` — auth-api.md 4.10).
   * 값은 그대로 노출되므로 내부 사유를 담지 않는다.
   */
  details?: Record<string, unknown>;
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
  readonly details?: Record<string, unknown>;

  constructor(options: BusinessExceptionOptions) {
    super(options.message, options.status);
    this.errorCode = options.errorCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterSec = options.retryAfterSec;
    this.logLevel = options.logLevel ?? 'warn';
    this.details = options.details;
  }
}

/** 하위 예외가 상태 코드만 고정하고 나머지는 그대로 받도록 하는 옵션 */
export type DomainExceptionOptions = Omit<BusinessExceptionOptions, 'status'>;
