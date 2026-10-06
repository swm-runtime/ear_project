import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { UserTier } from '@/modules/user/user.enum';
import { AudioQuality } from '@/modules/content/content.enum';

import { Plan } from '../entities/plan.entity';
import { PlanRepository } from '../repositories/plan.repository';
import { SubscriptionStore } from '../subscription.enum';
import { Entitlements, PlayLimitPolicy } from '../subscription.types';

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

  async findById(id: string, manager?: EntityManager): Promise<Plan | null> {
    return this.planRepository.findById(id, manager);
  }

  /** 판매 중인 요금제 — `display_order` 오름차순(낮은 티어 → 높은 티어) */
  async findAllActive(manager?: EntityManager): Promise<Plan[]> {
    return this.planRepository.findAllActive(manager);
  }

  /** 스토어 상품 ID → 요금제. 판매를 멈춘 요금제도 찾는다(기존 구독자의 갱신) */
  async findByStoreProductId(
    store: SubscriptionStore,
    productId: string,
    manager?: EntityManager,
  ): Promise<Plan | null> {
    return store === SubscriptionStore.APP_STORE
      ? this.planRepository.findByIosProductId(productId, manager)
      : this.planRepository.findByAndroidProductId(productId, manager);
  }

  /**
   * 그 티어의 권한(`subscription-api.md` 2장). 재생 한도 판정(`getPlayLimitPolicy`)과 **같은 행**에서
   * 읽고 같은 폴백을 쓴다 — 화면이 본 한도와 서버가 판정하는 한도가 어긋나지 않는다.
   */
  async getEntitlements(
    tier: UserTier,
    manager?: EntityManager,
  ): Promise<Entitlements> {
    const plan =
      (await this.findByTier(tier, manager)) ??
      (await this.findByTier(UserTier.LIGHT, manager));

    if (!plan) {
      throw new Error('plans 테이블에 요금제 행이 없어 권한을 조립할 수 없다');
    }

    return toEntitlements(plan);
  }

  /**
   * 이 티어가 들을 수 있는 가장 높은 음질(`player.md` 4.9). `getEntitlements`와 같은 행·같은 폴백이다 —
   * 설정 화면의 잠금 표시와 발급 판정이 어긋나지 않는다. 가입 체험은 음질을 바꾸지 않으므로 저장 티어로 본다.
   */
  async getMaxAudioQuality(
    tier: UserTier,
    manager?: EntityManager,
  ): Promise<AudioQuality> {
    return (await this.getEntitlements(tier, manager)).maxAudioQuality;
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
        fallback_applied: Boolean(plan),
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
   * 가입 체험(`subscription.md` 4.8)을 얹은 재생 한도 정책 — **재생 판정과 잔여 표시가 이 하나를 쓴다.**
   *
   * 체험 중이면 `trial` 요금제 행의 한도와 사용자 티어의 한도 중 **더 넉넉한 쪽**이다. 체험 기간에 한도가
   * 있는 요금제(데일리)를 구독한 사용자가 돈을 내고 오히려 덜 듣게 되면 안 된다. `isTopTier`는 사용자
   * 티어의 값을 그대로 둔다 — 화면 분기(페이월 vs 안내)는 구독 상태가 정한다.
   *
   * `trial` 행이 없으면 `getPlayLimitPolicy`의 폴백(라이트 한도 + error 로그)이 그대로 적용된다 —
   * 모를 때는 더 엄격한 쪽이다.
   */
  async getEffectivePlayLimitPolicy(
    tier: UserTier,
    isTrialActive: boolean,
    manager?: EntityManager,
  ): Promise<PlayLimitPolicy> {
    const base = await this.getPlayLimitPolicy(tier, manager);

    if (!isTrialActive) {
      return base;
    }

    const trial = await this.getPlayLimitPolicy(UserTier.TRIAL, manager);

    return {
      dailyPlayLimit: moreGenerousLimit(
        base.dailyPlayLimit,
        trial.dailyPlayLimit,
      ),
      isTopTier: base.isTopTier,
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
      fallback_applied: Boolean(lightPlan),
    });

    return lightPlan?.dailyDripCount ?? 0;
  }

  /**
   * 탐험 편성 편수(`drip-scheduling.md` 4.8 — `plans.daily_discovery_count`, 전 티어 1편).
   * 행 누락 폴백은 `getDailyDripCount`와 같은 논리다 — 전 티어 값이 같아 추정이 아니다.
   * 0이면 탐험 편성이 꺼진다(배포 없이 조정하는 정책값 — domain.md 8.1).
   */
  async getDailyDiscoveryCount(
    tier: UserTier,
    manager?: EntityManager,
  ): Promise<number> {
    const plan = await this.findByTier(tier, manager);

    if (plan) {
      return plan.isDripEnabled ? plan.dailyDiscoveryCount : 0;
    }

    const lightPlan = await this.findByTier(UserTier.LIGHT, manager);

    this.logger.error('plan row is missing for tier', {
      tier,
      fallback_applied: Boolean(lightPlan),
    });

    return lightPlan?.dailyDiscoveryCount ?? 0;
  }
}

export function toEntitlements(plan: Plan): Entitlements {
  return {
    dailyPlayLimit: plan.dailyPlayLimit,
    dailyDripCount: plan.isDripEnabled ? plan.dailyDripCount : 0,
    dripEnabled: plan.isDripEnabled,
    adsEnabled: plan.isAdsEnabled,
    maxAudioQuality: plan.maxAudioQuality,
  };
}

/** 두 한도 중 더 넉넉한 쪽 — `null`은 무제한이라 항상 이긴다 */
export function moreGenerousLimit(
  a: number | null,
  b: number | null,
): number | null {
  if (a === null || b === null) {
    return null;
  }

  return Math.max(a, b);
}
