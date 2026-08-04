import { HttpStatus } from '@nestjs/common';

import {
  BusinessException,
  DomainExceptionOptions,
} from './business.exception';
import { ErrorCode } from './error-code.enum';

/**
 * 외부 연동 실패 — AI 서버·스토어·스토리지.
 *
 * 외부 클라이언트(`<대상>Client`)가 타임아웃·비정상 응답을 이 예외로 변환한다.
 * **원본 에러는 로그에만 남기고 응답에 노출하지 않는다** (architecture.md 7.1·7.3).
 */
export class ExternalServiceException extends BusinessException {
  constructor(options: Partial<DomainExceptionOptions> = {}) {
    super({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.EXTERNAL_SERVICE_ERROR,
      message: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요',
      retryable: true,
      logLevel: 'error',
      ...options,
    });
  }
}
