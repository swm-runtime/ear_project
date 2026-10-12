import { describe, expect, it } from '@jest/globals';

import { PROFILE_COPY } from '../profile.copy';
import { planText } from './ProfileHeader';

describe('ProfileHeader planText — 프로필 플랜 줄', () => {
  it('다운그레이드 예약이 있으면 설정 요약과 같은 "{지금} · N월 N일까지 이용 · 이후 {다음}"', () => {
    expect(
      planText({
        kind: 'subscribed',
        planName: 'Pro',
        renewsAt: '2026-11-08T03:00:00Z',
        pendingPlan: { planName: 'Daily', effectiveAt: '2026-11-08T03:00:00Z' },
      }),
    ).toBe(`Pro · ${PROFILE_COPY.plan.pendingPlan('2026-11-08T03:00:00Z', 'Daily')}`);
  });

  it('해지 예약이면 "N월 N일까지 이용 · 이후 무료"', () => {
    expect(
      planText({ kind: 'cancelScheduled', planName: 'Pro', expiresAt: '2026-11-08T03:00:00Z' }),
    ).toBe(`Pro · ${PROFILE_COPY.plan.cancelScheduled('2026-11-08T03:00:00Z')}`);
  });
});
