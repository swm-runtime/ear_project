import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { UserTier } from '@/modules/user/user.enum';

import { Plan } from '../entities/plan.entity';
import { PlanRepository } from '../repositories/plan.repository';
import { PlayLimitPolicy } from '../subscription.types';

/**
 * `plans`는 subscription 모듈 소유다(domain.md 2장).
 * 티어별 정책 값(재생 한도·드립 편수)을 코드 상수가 아니라 이 테이블에서 읽는다 —
 * **티어명·수치를 하드코딩하지 않는다**(CLAUDE.md 공통 원칙).
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(private readonly planRepository: PlanRepository) {}

  async findByTier(
    tier: UserTier,
    manager?: EntityManager,
  ): Promise<Plan | null> {
    return this.planRepository.findByTier(tier, manager);
  }

  /**
   * `paywall.md` 4.1의 판정 입력. 한도 값은 `plans.daily_play_limit`에서 읽고
   * **티어명을 코드에 하드코딩하지 않는다.**
   *
   * **최상위 티어 판정은 `display_order`만으로 하지 않는다.** `plans`에 아직 `light` 행만
   * 있어서(유료 티어는 `price_krw` · `daily_play_limit`이 미정 — domain.md 8.1) 순서만
   * 보면 무료 티어가 최상위로 판정되고, 무료 사용자에게 페이월 대신 한도 안내가 나간다.
   *
   * 그래서 **무료 요금제(`price_krw = 0`)는 어떤 경우에도 최상위가 아니다**로 못박는다.
   * "더 팔 것이 없다"(합의 2026-08-06)가 최상위 티어의 정의인데, 무료보다 위가 없는 상태는
   * 성립하지 않는다. 티어명이 아니라 가격으로 판정하므로 티어가 늘어도 그대로 동작한다.
   *
   * 해당 티어의 행이 없으면 `light` 값으로 내려 판정한다 —
   * `getDailyDripCount`와 같은 폴백이며, 유료 행이 아직 없는 현재 상태에서 유일하게
   * 안전한 방향(더 엄격한 쪽)이다. **`light`마저 없으면 예외로 기동을 알린다.**
   * 한도를 모를 때 무제한으로 열어 주면 페이월이 조용히 꺼진 채 아무도 눈치채지 못한다.
   */
  async getPlayLimitPolicy(
    tier: UserTier,
    manager?: EntityManager,
  ): Promise<PlayLimitPolicy> {
    const [requested, activePlans] = await Promise.all([
      this.findByTier(tier, manager),
      this.planRepository.findAllActive(manager),
    ]);

    const plan = requested ?? (await this.findByTier(UserTier.LIGHT, manager));

    if (!requested) {
      this.logger.error('plan row is missing for tier', {
        tier,
        fallbackApplied: Boolean(plan),
      });
    }

    if (!plan) {
      throw new Error(
        'plans 테이블에 요금제 행이 없어 재생 한도를 판정할 수 없다',
      );
    }

    const hasHigherPlan = activePlans.some(
      (candidate) => candidate.displayOrder > plan.displayOrder,
    );

    return {
      dailyPlayLimit: plan.dailyPlayLimit,
      isTopTier: plan.priceKrw > 0 && !hasHigherPlan,
    };
  }

  /**
   * 일일 자동 적립 편수. 첫 드립 편성도 이 값을 상한으로 쓴다.
   *
   * **드립 편수는 티어와 무관하게 하루 2편으로 고정한다**(팀 확정).
   * 티어가 가르는 것은 재생 한도(`daily_play_limit`, FR-29)이지 드립 편수가 아니다 —
   * 드립으로 적립됐다고 해서 그날 다 들어야 하는 것이 아니므로 두 값은 독립이다.
   *
   * 그래도 값을 코드 상수로 두지 않는 이유: 편수는 **운영이 배포 없이 조정할 정책값**이다
   * (시범 운영 중 2편 → 3편 같은 조정). 상수로 옮기면 스토어 심사 주기가 걸린다.
   *
   * `plans`에는 아직 `light` 행만 있다 — `daily_drip_count`는 2로 확정됐지만
   * `price_krw` · `daily_play_limit`이 미정이라 유료 행을 완성할 수 없다(domain.md 8.1).
   * 행이 없으면 **`light` 값으로 내려 편성한다.** 전 티어 편수가 같으므로 이 폴백은
   * 추정이 아니라 정책상 같은 값이며, 행 누락 자체는 로그로 드러난다.
   *
   * 문서 정정 요청: `docs/changes/drip-count-fixed-across-tiers(be).md`
   */
  async getDailyDripCount(
    tier: UserTier,
    manager?: EntityManager,
  ): Promise<number> {
    const plan = await this.findByTier(tier, manager);

    if (plan) {
      return plan.isDripEnabled ? plan.dailyDripCount : 0;
    }

    const lightPlan = await this.findByTier(UserTier.LIGHT, manager);

    this.logger.error('plan row is missing for tier', {
      tier,
      fallbackApplied: Boolean(lightPlan),
    });

    return lightPlan?.dailyDripCount ?? 0;
  }
}
