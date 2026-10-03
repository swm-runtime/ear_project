import { UserTier } from '../user.enum';
import { resolveEffectiveTier } from './effective-tier.policy';

const NOW = new Date('2026-10-05T03:00:00.000Z');
const FUTURE = new Date('2026-10-09T19:00:00.000Z');
const PAST = new Date('2026-10-01T19:00:00.000Z');

describe('resolveEffectiveTier', () => {
  it('무료 사용자가 체험 기간 안이면 trial이다', () => {
    expect(
      resolveEffectiveTier({ tier: UserTier.LIGHT, trialEndsAt: FUTURE }, NOW),
    ).toBe(UserTier.TRIAL);
  });

  it('체험이 끝났으면 저장된 티어로 돌아간다', () => {
    expect(
      resolveEffectiveTier({ tier: UserTier.LIGHT, trialEndsAt: PAST }, NOW),
    ).toBe(UserTier.LIGHT);
  });

  it('체험을 받지 않은 계정은 저장된 티어 그대로다', () => {
    expect(
      resolveEffectiveTier({ tier: UserTier.LIGHT, trialEndsAt: null }, NOW),
    ).toBe(UserTier.LIGHT);
  });

  it('유료 구독 중이면 체험 기간이 남아 있어도 구독 티어다', () => {
    expect(
      resolveEffectiveTier({ tier: UserTier.DAILY, trialEndsAt: FUTURE }, NOW),
    ).toBe(UserTier.DAILY);
  });
});
