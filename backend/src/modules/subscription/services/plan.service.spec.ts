import { UserTier } from '@/modules/user/user.enum';

import { Plan } from '../entities/plan.entity';
import { PlanRepository } from '../repositories/plan.repository';
import { PlanService } from './plan.service';

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
});
