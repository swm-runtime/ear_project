import { describe, expect, it } from '@jest/globals';

import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { MySubscription } from '../subscription.types';
import { toPurchaseFeedback } from './purchase-feedback';

const SUBSCRIBED: MySubscription = {
  plan: {
    status: 'subscribed',
    tier: 'pro',
    planName: 'Pro',
    dailyPlayLimit: null,
    renewsAt: '2026-11-08T03:00:00Z',
    expiresAt: null,
    hasPaymentIssue: false,
  },
  entitlements: { dailyPlayLimit: null, dailyDripCount: 2, dripEnabled: true, adsEnabled: false },
  store: 'app_store',
  pendingPlan: null,
};

describe('toPurchaseFeedback — 결제 결과 문구', () => {
  it('iOS [유지](지금 요금제 다시 구매)가 성공하면 "예약된 변경을 취소했어요"', () => {
    expect(toPurchaseFeedback({ kind: 'success', subscription: SUBSCRIBED }, 'current').toast).toBe(
      SUBSCRIPTION_COPY.result.keptCurrent,
    );
  });

  it('이미 예약돼 있음은 안내 톤이다 — 실패 빨강이 아니다', () => {
    expect(
      toPurchaseFeedback({ kind: 'failed', reason: 'downgradeAlreadyScheduled' }, 'downgrade')
        .notice,
    ).toEqual({ message: SUBSCRIPTION_COPY.result.downgradeAlreadyScheduled, tone: 'info' });
  });
});
