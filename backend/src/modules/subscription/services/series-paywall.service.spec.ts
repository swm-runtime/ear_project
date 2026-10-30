import { UserTier } from '@/modules/user/user.enum';

import { PlanService } from './plan.service';
import { SeriesPaywallService } from './series-paywall.service';

const NOW = new Date('2026-10-30T03:00:00.000Z');

describe('SeriesPaywallService (KAN-290)', () => {
  let env: Record<string, string>;
  let planService: jest.Mocked<PlanService>;
  let service: SeriesPaywallService;

  beforeEach(() => {
    env = { SERIES_PAYWALL_ENABLED: 'true' };
    planService = {
      isPaidTier: jest.fn((tier: UserTier) =>
        Promise.resolve(tier === UserTier.PRO || tier === UserTier.DAILY),
      ),
    } as unknown as jest.Mocked<PlanService>;
    service = new SeriesPaywallService(
      { get: (key: string) => env[key] } as never,
      planService,
    );
  });

  it('유료 요금제 여부는 요금제 데이터(isPaidTier)로 판정한다 — 데일리·프로는 열고 라이트는 잠근다', async () => {
    await expect(
      service.resolveAccess({ tier: UserTier.PRO, trialEndsAt: null }, NOW),
    ).resolves.toEqual({ lockedAfterEpisodeNo: null });
    await expect(
      service.resolveAccess({ tier: UserTier.DAILY, trialEndsAt: null }, NOW),
    ).resolves.toEqual({ lockedAfterEpisodeNo: null });
    await expect(
      service.resolveAccess({ tier: UserTier.LIGHT, trialEndsAt: null }, NOW),
    ).resolves.toEqual({ lockedAfterEpisodeNo: 3 });
  });

  it('체험 중이면 요금제를 읽지 않고 연다', async () => {
    await expect(
      service.resolveAccess(
        { tier: UserTier.LIGHT, trialEndsAt: new Date(NOW.getTime() + 1000) },
        NOW,
      ),
    ).resolves.toEqual({ lockedAfterEpisodeNo: null });
    expect(planService.isPaidTier).not.toHaveBeenCalled();
  });

  it('꺼져 있으면 요금제를 읽지 않고 연다', async () => {
    env.SERIES_PAYWALL_ENABLED = '';

    await expect(
      service.resolveAccess({ tier: UserTier.LIGHT, trialEndsAt: null }, NOW),
    ).resolves.toEqual({ lockedAfterEpisodeNo: null });
    expect(planService.isPaidTier).not.toHaveBeenCalled();
  });

  it('배치 캐시를 넘기면 같은 티어의 요금제를 한 번만 읽는다', async () => {
    const cache = new Map<UserTier, boolean>();

    for (let i = 0; i < 3; i += 1) {
      await service.resolveAccess(
        { tier: UserTier.LIGHT, trialEndsAt: null },
        NOW,
        undefined,
        cache,
      );
    }

    expect(planService.isPaidTier).toHaveBeenCalledTimes(1);
  });

  it('SQL판 파라미터 — 켜져 있으면 무료 편수와 열리는 저장 티어(trial 제외), 꺼져 있으면 NULL', async () => {
    env.SERIES_FREE_EPISODES = '4';
    await expect(service.resolveSqlParams()).resolves.toEqual({
      lockedAfterEpisodeNo: 4,
      unlockedTiers: [UserTier.DAILY, UserTier.PRO],
    });
    expect(planService.isPaidTier).not.toHaveBeenCalledWith(
      UserTier.TRIAL,
      undefined,
    );

    env.SERIES_PAYWALL_ENABLED = 'false';
    await expect(service.resolveSqlParams()).resolves.toEqual({
      lockedAfterEpisodeNo: null,
      unlockedTiers: [],
    });
  });
});
