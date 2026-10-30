import { describe, expect, it } from '@jest/globals';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { formatPlanGrantLine } from '../plan-grant';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { MySubscription, PlanGrant } from '../subscription.types';
import {
  inviteErrorMessage,
  inviteSuccessMessage,
  subscriberConfirmPlanName,
} from './useInviteCodeForm';
import { toEventNotice } from './useSubscriptionScreen';

const GRANT: PlanGrant = {
  name: '산군 PoC',
  tier: 'pro',
  planName: 'Pro',
  endsAt: '2026-11-08T20:00:00Z',
  lastDate: '2026-11-08',
};

const subscription = (
  status: MySubscription['plan']['status'],
  grant: PlanGrant | null,
): MySubscription => ({
  plan: {
    status,
    tier: 'pro',
    planName: 'Pro',
    dailyPlayLimit: null,
    renewsAt: null,
    expiresAt: null,
    hasPaymentIssue: false,
    grant,
  },
  entitlements: { dailyPlayLimit: null, dailyDripCount: 5, dripEnabled: true, adsEnabled: false },
  store: null,
  pendingPlan: null,
});

const apiError = (code: string, retryAfterSec: number | null = null) =>
  new ApiError(code, code, false, retryAfterSec, null, 409);

describe('formatPlanGrantLine — 세 곳 같은 프로모션 줄(KAN-182)', () => {
  it('"{이름} 프로모션 이용 중 · {요금제} · N월 N일까지" — 날짜는 last_date 그대로다', () => {
    // when
    const line = formatPlanGrantLine(GRANT);

    // then
    expect(line).toBe('산군 PoC 프로모션 이용 중 · Pro · 11월 8일까지');
  });

  it('지급 중이 아니면 null — 줄을 그리지 않는다', () => {
    expect(formatPlanGrantLine(null)).toBeNull();
  });
});

describe('inviteErrorMessage — subscription-api.md 5장 문구 그대로', () => {
  it.each([
    [ERROR_CODES.INVITE_CODE_NOT_FOUND, '사용할 수 없는 코드예요'],
    [ERROR_CODES.INVITE_CODE_EXPIRED, '사용 기간이 지난 코드예요'],
    [ERROR_CODES.INVITE_CODE_EXHAUSTED, '선착순이 마감된 코드예요'],
    [ERROR_CODES.INVITE_CODE_ALREADY_USED, '이미 사용한 코드예요'],
    [ERROR_CODES.INVITE_GRANT_ALREADY_ACTIVE, '다른 코드의 혜택이 아직 남아 있어요'],
  ])('%s → %s', (code, message) => {
    expect(inviteErrorMessage(apiError(code))).toBe(message);
  });

  it('네트워크 실패는 연결 확인 안내', () => {
    expect(inviteErrorMessage(apiError(ERROR_CODES.NETWORK_ERROR))).toBe(
      SUBSCRIPTION_COPY.invite.network,
    );
  });

  it('재시도 뒤에도 남은 레이트 리밋(Retry-After 있음)은 잠시 후 안내', () => {
    expect(inviteErrorMessage(apiError('RATE_LIMITED', 30))).toBe(
      SUBSCRIPTION_COPY.invite.rateLimited,
    );
  });
});

describe('inviteSuccessMessage — 응답의 grant 로 만든 성공 안내', () => {
  it('지급 내용이 실리면 "{이름} 프로모션이 시작됐어요 · {요금제} · N월 N일까지"', () => {
    expect(inviteSuccessMessage(subscription('free', GRANT))).toBe(
      '산군 PoC 프로모션이 시작됐어요 · Pro · 11월 8일까지',
    );
  });

  it('grant 가 없으면 짧은 안내 — 200 은 성공이다', () => {
    expect(inviteSuccessMessage(subscription('free', null))).toBe(
      SUBSCRIPTION_COPY.invite.successFallback,
    );
  });
});

describe('toEventNotice — 요금제 관리 프로모션 알림', () => {
  it('구독 없이 지급 중이면 둘째 줄이 "구독을 시작하면 프로모션이 끝나요"', () => {
    // when
    const notice = toEventNotice(subscription('free', GRANT));

    // then
    expect(notice).toEqual({
      title: '산군 PoC 프로모션 이용 중 · Pro · 11월 8일까지',
      detail: SUBSCRIPTION_COPY.grant.noticeDetailFree,
    });
  });

  it('구독 중에 지급도 받았으면 "구독은 그대로 이어져요"', () => {
    expect(toEventNotice(subscription('subscribed', GRANT))?.detail).toBe(
      SUBSCRIPTION_COPY.grant.noticeDetailSubscribed,
    );
  });

  it('지급이 없거나 구독을 아직 모르면 null — 섹션이 없다', () => {
    expect(toEventNotice(subscription('free', null))).toBeNull();
    expect(toEventNotice(null)).toBeNull();
  });
});

describe('subscriberConfirmPlanName — 유료 구독 중 코드 입력 전 확인(2026-10-19)', () => {
  it('구독 중·해지 예약·결제 유예이고 지급이 없으면 지금 요금제 이름 — 확인을 띄운다', () => {
    expect(subscriberConfirmPlanName(subscription('subscribed', null))).toBe('Pro');
    expect(subscriberConfirmPlanName(subscription('cancel_scheduled', null))).toBe('Pro');
    expect(subscriberConfirmPlanName(subscription('grace', null))).toBe('Pro');
  });

  it('구독이 없으면 null — 바로 보낸다', () => {
    expect(subscriberConfirmPlanName(subscription('free', null))).toBeNull();
  });

  it('이미 지급 중이면 null — 서버가 막거나 그대로 돌려준다', () => {
    expect(subscriberConfirmPlanName(subscription('subscribed', GRANT))).toBeNull();
  });

  it('구독 조회를 아직 못 받았으면 null — 확인 때문에 입력을 막지 않는다', () => {
    expect(subscriberConfirmPlanName(undefined)).toBeNull();
  });

  it('확인 문구는 지금 요금제 이름을 넣는다', () => {
    expect(SUBSCRIPTION_COPY.invite.subscriberConfirmTitle('Pro')).toBe('이미 Pro 구독 중이에요');
  });
});
