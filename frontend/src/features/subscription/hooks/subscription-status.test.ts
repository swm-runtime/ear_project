import { describe, expect, it } from '@jest/globals';

import { SUBSCRIPTION_COPY } from '../subscription.copy';
import { scheduledChangeNotice, type SubscriptionStatusVM } from './subscription-status';

const SUBSCRIBED: SubscriptionStatusVM = {
  kind: 'subscribed',
  planName: '무제한',
  renewsAt: '2026-11-08T03:00:00Z',
  pendingPlan: null,
  otherStore: null,
};

describe('scheduledChangeNotice — 요금제 관리 알림 섹션(KAN-160)', () => {
  it('다운그레이드 예약이 있으면 "N월 N일부터 {이름} 요금제가 적용돼요"', () => {
    const status: SubscriptionStatusVM = {
      ...SUBSCRIBED,
      pendingPlan: { tier: 'daily', planName: '매일', effectiveAt: '2026-11-08T03:00:00Z' },
    };

    expect(scheduledChangeNotice(status, '가벼운')).toEqual({
      title: SUBSCRIPTION_COPY.status.pendingPlan('2026-11-08T03:00:00Z', '매일'),
      detail: SUBSCRIPTION_COPY.status.pendingPlanNoticeDetail('무제한'),
    });
  });

  it('해지 예약이면 만료일까지 지금 요금제, 이후 무료 요금제(서버 이름)로 바뀐다고 알린다', () => {
    const status: SubscriptionStatusVM = {
      kind: 'cancelScheduled',
      planName: '무제한',
      expiresAt: '2026-11-08T03:00:00Z',
      otherStore: null,
    };

    const notice = scheduledChangeNotice(status, '가벼운');

    expect(notice?.title).toBe(
      SUBSCRIPTION_COPY.status.cancelScheduledNotice('2026-11-08T03:00:00Z', '무제한'),
    );
    expect(notice?.detail).toBe('이후 가벼운 요금제로 바뀌어요');
  });

  it('무료 요금제 이름을 모르면 "무료"로 쓴다', () => {
    const status: SubscriptionStatusVM = {
      kind: 'cancelScheduled',
      planName: '무제한',
      expiresAt: '2026-11-08T03:00:00Z',
      otherStore: null,
    };

    expect(scheduledChangeNotice(status, null)?.detail).toBe('이후 무료 요금제로 바뀌어요');
  });

  it('예약된 변경이 없으면 null — 섹션을 그리지 않는다', () => {
    expect(scheduledChangeNotice(SUBSCRIBED, '가벼운')).toBeNull();
    expect(scheduledChangeNotice({ kind: 'free', dailyPlayLimit: 2 }, '가벼운')).toBeNull();
    expect(
      scheduledChangeNotice({ kind: 'grace', planName: '무제한', otherStore: null }, '가벼운'),
    ).toBeNull();
    expect(scheduledChangeNotice(null, '가벼운')).toBeNull();
  });
});
