import { HttpStatus } from '@nestjs/common';

import {
  BusinessException,
  DomainExceptionOptions,
} from './business.exception';

/**
 * 상태 충돌 (409) — 중복 생성 등.
 *
 * 유니크 위반을 도메인 흐름으로 흡수할 수 있으면 예외로 만들지 않는다
 * (architecture.md 8.4). 중복 적립은 "이미 있음"으로 처리하고 정상 응답한다.
 *
 * `@nestjs/common`의 동명 예외와 섞이지 않도록 `Business` 접두사를 붙인다
 * (architecture.md 7.2).
 */
export class BusinessConflictException extends BusinessException {
  constructor(options: DomainExceptionOptions) {
    super({ status: HttpStatus.CONFLICT, logLevel: 'warn', ...options });
  }
}
