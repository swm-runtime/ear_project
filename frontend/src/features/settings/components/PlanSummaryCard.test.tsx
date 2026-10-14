import { describe, expect, it } from '@jest/globals';

import { SETTINGS_COPY } from '../settings.copy';
import { planLines, valueText } from './PlanSummaryCard';

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

  it('해지 예약이면 "N월 N일까지 이용 · 이후 무료"', () => {
    expect(
      valueText({ kind: 'cancelScheduled', planName: 'Pro', expiresAt: '2026-11-08T03:00:00Z' }),
    ).toBe(`Pro · ${SETTINGS_COPY.plan.cancelScheduled('2026-11-08T03:00:00Z')}`);
  });
});

describe('PlanSummaryCard planLines — 초대 코드 지급 이벤트 줄(KAN-182)', () => {
  const EVENT = 'SANKUN 이벤트 이용 중 · Pro · 12월 10일까지';

  it('지급이 없으면 상태 줄 하나', () => {
    // given
    const vm = {
      kind: 'free' as const,
      dailyPlayLimit: 3,
      trialLastFreeDate: null,
      eventLine: null,
    };

    // when
    const lines = planLines(vm);

    // then
    expect(lines).toEqual([SETTINGS_COPY.plan.free(3)]);
  });

  it('구독 없이 지급 중이면 "무료 이용 중" 대신 이벤트 줄 하나만 그린다', () => {
    // given
    const vm = {
      kind: 'free' as const,
      dailyPlayLimit: null,
      trialLastFreeDate: null,
      eventLine: EVENT,
    };

    // when
    const lines = planLines(vm);

    // then
    expect(lines).toEqual([EVENT]);
  });

  it('구독 중에 지급도 받았으면 구독 줄 밑에 이벤트 줄을 더한다', () => {
    // given
    const vm = {
      kind: 'subscribed' as const,
      planName: 'Daily',
      renewsAt: null,
      pendingPlan: null,
      eventLine: EVENT,
    };

    // when
    const lines = planLines(vm);

    // then
    expect(lines).toEqual(['Daily', EVENT]);
  });
});
