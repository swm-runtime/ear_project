import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { UserTier } from '@/modules/user/user.enum';

import { Plan } from '../entities/plan.entity';
import { PlanRepository } from '../repositories/plan.repository';

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
