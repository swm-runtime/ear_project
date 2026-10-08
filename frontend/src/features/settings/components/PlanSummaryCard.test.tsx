import { describe, expect, it } from '@jest/globals';

import { SETTINGS_COPY } from '../settings.copy';
import { valueText } from './PlanSummaryCard';

describe('PlanSummaryCard valueText — 설정 요금제 요약 줄', () => {
  it('다운그레이드 예약이 있으면 "{지금} · N월 N일까지 이용 · 이후 {다음}"(PM 2026-10-08)', () => {
    expect(
      valueText({
        kind: 'subscribed',
        planName: 'Pro',
        renewsAt: '2026-11-08T03:00:00Z',
        pendingPlan: { planName: 'Daily', effectiveAt: '2026-11-08T03:00:00Z' },
      }),
    ).toBe(`Pro · ${SETTINGS_COPY.plan.pendingPlan('2026-11-08T03:00:00Z', 'Daily')}`);
  });

  it('예약이 없으면 종전대로 다음 결제일', () => {
    expect(
      valueText({
        kind: 'subscribed',
        planName: 'Pro',
        renewsAt: '2026-11-08T03:00:00Z',
        pendingPlan: null,
      }),
    ).toBe(`Pro · ${SETTINGS_COPY.plan.renewsAt('2026-11-08T03:00:00Z')}`);
  });

  it('해지 예약이면 "N월 N일까지 이용 가능"', () => {
    expect(
      valueText({ kind: 'cancelScheduled', planName: 'Pro', expiresAt: '2026-11-08T03:00:00Z' }),
    ).toBe(`Pro · ${SETTINGS_COPY.plan.cancelScheduled('2026-11-08T03:00:00Z')}`);
  });
});
