import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerLimitDetail, ThrottlerStorage } from '@nestjs/throttler';

import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ipTracker, RateLimitGuard } from './rate-limit.guard';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'test-secret';

/** protected 멤버를 테스트에서 부른다 — 가드의 공개 동작(canActivate)은 라이브러리 몫이다 */
interface GuardInternals {
  getTracker(req: Record<string, unknown>): Promise<string>;
  throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void>;
}

function buildGuard(): GuardInternals {
  return new RateLimitGuard(
    { throttlers: [] },
    {} as ThrottlerStorage,
    new Reflector(),
    new JwtService({ secret: SECRET }),
  ) as unknown as GuardInternals;
}

function buildDetail(
  overrides: Partial<ThrottlerLimitDetail> = {},
): ThrottlerLimitDetail {
  return {
    ttl: 60_000,
    limit: 300,
    key: 'k',
    tracker: 't',
    totalHits: 301,
    timeToExpire: 42,
    isBlocked: true,
    timeToBlockExpire: 42,
    ...overrides,
  };
}

describe('RateLimitGuard', () => {
  describe('getTracker', () => {
    it('서명이 맞는 access token이면 사용자 id로 센다', async () => {
      // given
      const token = new JwtService({ secret: SECRET }).sign({ sub: USER_ID });

      // when
      const tracker = await buildGuard().getTracker({
        ip: '10.0.0.1',
        headers: { authorization: `Bearer ${token}` },
      });

      // then
      expect(tracker).toBe(`user:${USER_ID}`);
    });

    it('서명이 틀린 토큰은 사용자로 인정하지 않고 IP로 센다 — 위조 sub로 버킷을 늘릴 수 없다', async () => {
      // given
      const forged = new JwtService({ secret: 'other' }).sign({ sub: USER_ID });

      // when
      const tracker = await buildGuard().getTracker({
        ip: '10.0.0.1',
        headers: { authorization: `Bearer ${forged}` },
      });

      // then
      expect(tracker).toBe('ip:10.0.0.1');
    });

    it('토큰이 없으면 IP로 센다', async () => {
      // when
      const tracker = await buildGuard().getTracker({
        ip: '10.0.0.2',
        headers: {},
      });

      // then
      expect(tracker).toBe('ip:10.0.0.2');
    });

    it('ipTracker는 토큰이 있어도 IP로 센다 — 인증 라우트용', async () => {
      // given
      const token = new JwtService({ secret: SECRET }).sign({ sub: USER_ID });

      // when
      const tracker = await ipTracker({
        ip: '10.0.0.3',
        headers: { authorization: `Bearer ${token}` },
      });

      // then
      expect(tracker).toBe('ip:10.0.0.3');
    });
  });

  describe('throwThrottlingException', () => {
    it('429 + TOO_MANY_REQUESTS + retry_after_sec 규격으로 던진다', async () => {
      // when
      const throwing = buildGuard().throwThrottlingException(
        {} as ExecutionContext,
        buildDetail({ timeToBlockExpire: 42 }),
      );

      // then
      await expect(throwing).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
        retryable: true,
        retryAfterSec: 42,
      });
    });

    it('남은 시간이 0으로 오면 최소 1초를 준다 — 0초 대기는 즉시 재시도 폭주가 된다', async () => {
      // when
      const throwing = buildGuard().throwThrottlingException(
        {} as ExecutionContext,
        buildDetail({ timeToBlockExpire: 0, timeToExpire: 0 }),
      );

      // then
      await expect(throwing).rejects.toMatchObject({ retryAfterSec: 1 });
    });
  });
});
