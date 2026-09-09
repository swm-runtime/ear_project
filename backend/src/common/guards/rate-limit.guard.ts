import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

/** 요청 키 계산에 필요한 만큼만 본다 — Express Request 전체 타입을 끌어오지 않는다 */
interface TrackedRequest {
  ip?: string;
  headers?: { authorization?: string };
}

const TOO_MANY_REQUESTS_MESSAGE = '요청이 많아요. 잠시 후 다시 시도해주세요';

/** IP 키 — 인증 라우트처럼 사용자가 아직 없는 곳에서 `@Throttle`의 `getTracker`로 쓴다 */
export function ipTracker(req: Record<string, unknown>): Promise<string> {
  return Promise.resolve(`ip:${(req as TrackedRequest).ip ?? 'unknown'}`);
}

/**
 * `architecture.md` 9.6 — 레이트 리밋의 실행부. `@nestjs/throttler`의 가드에 두 가지를 얹는다.
 *
 * **키**: 인증 사용자는 사용자 id, 비인증은 IP. 전역 가드는 `JwtAuthGuard`(컨트롤러 가드)보다
 * 먼저 돌아 `request.user`가 아직 없으므로 **여기서 access token을 직접 검증해** 사용자를
 * 가른다(서명 검증은 로컬 HMAC이라 싸다). 검증 없이 payload만 읽으면 임의의 `sub`를 박은
 * 위조 토큰으로 버킷을 무한히 늘려 한도를 우회할 수 있다 — 검증에 실패한 토큰은 IP로 센다.
 *
 * **응답**: 라이브러리 기본 `ThrottlerException`은 우리 에러 규격(`common-error-handling.md`)의
 * `retry_after_sec`을 채우지 못한다. `BusinessException`으로 바꿔 던져 필터가 429 +
 * `TOO_MANY_REQUESTS` + `retry_after_sec`으로 내보내게 한다(`Retry-After` 헤더는 가드가 이미 단다).
 *
 * `/health`는 `@SkipThrottle()`로 제외한다(헬스체크·모니터링).
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = this.verifiedUserId(
      (req as TrackedRequest).headers?.authorization,
    );

    return userId ? Promise.resolve(`user:${userId}`) : ipTracker(req);
  }

  protected throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // 저장소가 초 단위로 준다. 차단 만료가 없으면 창 만료를, 그것도 없으면 최소 1초
    const retryAfterSec = Math.max(
      detail.timeToBlockExpire,
      detail.timeToExpire,
      1,
    );

    return Promise.reject(
      new BusinessException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
        message: TOO_MANY_REQUESTS_MESSAGE,
        retryable: true,
        retryAfterSec,
      }),
    );
  }

  private verifiedUserId(authorization: string | undefined): string | null {
    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify<{ sub?: unknown }>(token);

      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      // 만료·위조 토큰은 인증 가드가 401로 거른다 — 여기서는 키만 IP로 내린다
      return null;
    }
  }
}
