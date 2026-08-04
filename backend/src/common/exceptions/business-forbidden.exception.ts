import { HttpStatus } from '@nestjs/common';

import {
  BusinessException,
  DomainExceptionOptions,
} from './business.exception';

/**
 * 권한 없음 (403) — 티어 부족, 재생 한도 초과, 회수된 콘텐츠 등.
 *
 * 페이월·한도 초과처럼 **서비스가 의도한 정상 분기**는 `logLevel: 'info'`로
 * 넘긴다 (convention.md 8.2).
 *
 * `@nestjs/common`의 동명 예외와 섞이지 않도록 `Business` 접두사를 붙인다
 * (architecture.md 7.2).
 */
export class BusinessForbiddenException extends BusinessException {
  constructor(options: DomainExceptionOptions) {
    super({ status: HttpStatus.FORBIDDEN, logLevel: 'warn', ...options });
  }
}
