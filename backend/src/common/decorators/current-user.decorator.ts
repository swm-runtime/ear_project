import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * 인증 Guard가 요청에 실어 주는 최소 정보.
 * `common/`은 도메인을 모르므로 role을 문자열로 둔다 (architecture.md 4.2).
 */
export interface AuthenticatedUser {
  id: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * architecture.md 9.2 — userId를 클라이언트가 보낸 값으로 받지 않고 토큰에서 꺼낸 값을 쓴다(IDOR 방지).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error(
        'current user is missing — JwtAuthGuard가 적용되지 않았다',
      );
    }

    return request.user;
  },
);
