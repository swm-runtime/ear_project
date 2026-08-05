import { HttpStatus } from '@nestjs/common';

import {
  BusinessException,
  DomainExceptionOptions,
} from './business.exception';

/**
 * 리소스 없음 (404). 판정은 Service가 한다 (architecture.md 7.3).
 *
 * `@nestjs/common`의 동명 예외와 섞이지 않도록 `Business` 접두사를 붙인다
 * (architecture.md 7.2).
 */
export class BusinessNotFoundException extends BusinessException {
  constructor(options: DomainExceptionOptions) {
    super({ status: HttpStatus.NOT_FOUND, logLevel: 'warn', ...options });
  }
}
