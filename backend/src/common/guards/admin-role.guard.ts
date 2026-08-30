import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AuthenticatedRequest } from '@/common/decorators/current-user.decorator';
import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

const ADMIN_ROLE = 'admin';

/**
 * admin.md 4.1 — 관리자 API는 서버가 `role == 'admin'`을 검증한다. UI 은닉에 의존하지 않는다.
 * `JwtAuthGuard` 다음에 둔다 — `request.user`는 그 가드가 채운다.
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user?.role !== ADMIN_ROLE) {
      throw new BusinessForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: '관리자만 사용할 수 있어요',
      });
    }

    return true;
  }
}
