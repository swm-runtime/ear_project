import { UserTier } from '@/modules/user/user.enum';

import { Plan } from '../entities/plan.entity';
import { PlanRepository } from '../repositories/plan.repository';
import { moreGenerousLimit, PlanService } from './plan.service';

function buildPlan(overrides: Partial<Plan>): Plan {
  return {
    id: 'plan-1',
    tier: UserTier.LIGHT,
    name: '라이트',
    description: '',
    dailyPlayLimit: 2,
    dailyDripCount: 2,
    isDripEnabled: true,
    isAdsEnabled: true,
    priceKrw: 0,
    storeProductIdIos: null,
    storeProductIdAndroid: null,
    displayOrder: 1,
    isActive: true,
    ...overrides,
  } as Plan;
}

const LIGHT_PLAN = buildPlan({ tier: UserTier.LIGHT });
const PRO_PLAN = buildPlan({
  tier: UserTier.PRO,
  dailyPlayLimit: null,
  priceKrw: 9900,
  displayOrder: 3,
});

describe('PlanService', () => {
  let service: PlanService;
  let repository: jest.Mocked<PlanRepository>;

  beforeEach(() => {
    repository = {
      findByTier: jest.fn().mockResolvedValue(LIGHT_PLAN),
      findAllActive: jest.fn().mockResolvedValue([LIGHT_PLAN]),
    } as unknown as jest.Mocked<PlanRepository>;

    service = new PlanService(repository);
  });

  describe('getPlayLimitPolicy', () => {
    it('무료 요금제만 있어도 무료 티어를 최상위로 보지 않는다', async () => {
      // given — 유료 행이 아직 없다(domain.md 8.1). `display_order`만 보면 무료가 최상위가
      // 되어 무료 사용자에게 페이월 대신 한도 안내가 나간다

      // when
      const policy = await service.getPlayLimitPolicy(UserTier.LIGHT);

      // then
      expect(policy).toEqual({ dailyPlayLimit: 2, isTopTier: false });
    });

    it('상위 요금제가 있으면 최상위가 아니다', async () => {
      // given
      const dailyPlan = buildPlan({
        tier: UserTier.DAILY,
        priceKrw: 4900,
        displayOrder: 2,
        dailyPlayLimit: 5,
      });
      repository.findByTier.mockResolvedValue(dailyPlan);
      repository.findAllActive.mockResolvedValue([
        LIGHT_PLAN,
        dailyPlan,
        PRO_PLAN,
      ]);

      // when
      const policy = await service.getPlayLimitPolicy(UserTier.DAILY);

      // then
      expect(policy).toEqual({ dailyPlayLimit: 5, isTopTier: false });
    });

    it('유료이면서 위에 아무것도 없으면 최상위다', async () => {
      // given
      repository.findByTier.mockResolvedValue(PRO_PLAN);
      repository.findAllActive.mockResolvedValue([LIGHT_PLAN, PRO_PLAN]);

      // when
      const policy = await service.getPlayLimitPolicy(UserTier.PRO);

      // then
      expect(policy).toEqual({ dailyPlayLimit: null, isTopTier: true });
    });

    it('행이 없는 티어는 무료 정책으로 내려 판정한다', async () => {
      // given — 유료 행이 아직 없는 동안 유일하게 안전한 방향(더 엄격한 쪽)이다
      repository.findByTier.mockImplementation((tier: UserTier) =>
        Promise.resolve(tier === UserTier.LIGHT ? LIGHT_PLAN : null),
      );

      // when
      const policy = await service.getPlayLimitPolicy(UserTier.DAILY);

      // then
      expect(policy).toEqual({ dailyPlayLimit: 2, isTopTier: false });
    });

    it('요금제 행이 하나도 없으면 무제한으로 열지 않고 실패시킨다', async () => {
      // given — 한도를 모를 때 열어 주면 페이월이 조용히 꺼진다
      repository.findByTier.mockResolvedValue(null);
      repository.findAllActive.mockResolvedValue([]);

      // when · then
      await expect(service.getPlayLimitPolicy(UserTier.LIGHT)).rejects.toThrow(
        /재생 한도를 판정할 수 없다/,
      );
    });
  });

  describe('getEffectivePlayLimitPolicy — 가입 체험(subscription.md 4.8)', () => {
    const DAILY_PLAN = buildPlan({
      tier: UserTier.DAILY,
      dailyPlayLimit: 5,
      priceKrw: 3900,
      displayOrder: 2,
    });
    const TRIAL_PLAN = buildPlan({
      tier: UserTier.TRIAL,
      dailyPlayLimit: null,
      displayOrder: 0,
      isActive: false,
    });
    const byTier: Record<string, Plan | null> = {
      light: LIGHT_PLAN,
      daily: DAILY_PLAN,
      pro: PRO_PLAN,
      trial: TRIAL_PLAN,
    };

    beforeEach(() => {
      repository.findByTier.mockImplementation((tier) =>
        Promise.resolve(byTier[tier] ?? null),
      );
      // trial 행은 판매하지 않아 활성 목록에 없다
      repository.findAllActive.mockResolvedValue([
        LIGHT_PLAN,
        DAILY_PLAN,
        PRO_PLAN,
      ]);
    });

    it('체험 중인 무료 사용자는 무제한이다', async () => {
      const policy = await service.getEffectivePlayLimitPolicy(
        UserTier.LIGHT,
        true,
      );

      expect(policy).toEqual({ dailyPlayLimit: null, isTopTier: false });
    });

    it('체험 중이 아니면 티어의 한도 그대로다', async () => {
      const policy = await service.getEffectivePlayLimitPolicy(
        UserTier.LIGHT,
        false,
      );

      expect(policy).toEqual({ dailyPlayLimit: 2, isTopTier: false });
    });

    it('체험 중에 한도가 있는 요금제를 구독해도 더 넉넉한 쪽을 쓴다', async () => {
      // 돈을 내고 오히려 덜 듣게 되면 안 된다
      const policy = await service.getEffectivePlayLimitPolicy(
        UserTier.DAILY,
        true,
      );

      expect(policy.dailyPlayLimit).toBeNull();
    });

    it('trial 요금제의 한도를 숫자로 바꾸면 그 값과 티어 한도 중 큰 쪽이다 — 배포 없이 조정하는 정책값', async () => {
      // given — 운영이 체험을 "무제한"에서 "하루 4편"으로 낮춘 경우
      byTier.trial = buildPlan({ ...TRIAL_PLAN, dailyPlayLimit: 4 });

      // then
      await expect(
        service.getEffectivePlayLimitPolicy(UserTier.LIGHT, true),
      ).resolves.toMatchObject({ dailyPlayLimit: 4 });
      await expect(
        service.getEffectivePlayLimitPolicy(UserTier.DAILY, true),
      ).resolves.toMatchObject({ dailyPlayLimit: 5 });

      byTier.trial = TRIAL_PLAN;
    });

    it('trial 요금제 행이 없으면 원래 한도로 내려간다 — 모를 때는 엄격한 쪽이다', async () => {
      // given
      byTier.trial = null;

      // when
      const policy = await service.getEffectivePlayLimitPolicy(
        UserTier.LIGHT,
        true,
      );

      // then
      expect(policy.dailyPlayLimit).toBe(2);

      byTier.trial = TRIAL_PLAN;
    });
  });

  describe('moreGenerousLimit', () => {
    it('null은 무제한이라 항상 이긴다', () => {
      expect(moreGenerousLimit(2, null)).toBeNull();
      expect(moreGenerousLimit(null, 5)).toBeNull();
    });

    it('둘 다 숫자면 큰 쪽이다', () => {
      expect(moreGenerousLimit(2, 5)).toBe(5);
    });
  });
});
