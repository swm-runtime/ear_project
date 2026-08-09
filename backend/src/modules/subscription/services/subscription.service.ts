import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { UserTier } from '@/modules/user/user.enum';

import { Subscription } from '../entities/subscription.entity';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { PlanStatus, SubscriptionStatus } from '../subscription.enum';
import { PlanView } from '../subscription.types';
import { PlanService } from './plan.service';

/**
 * `subscriptions`는 subscription 모듈 소유다(domain.md 2장).
 * 다른 모듈은 Repository를 직접 주입받지 않고 이 Service만 호출한다(architecture.md 4.3).
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly planService: PlanService,
  ) {}

  /**
   * domain.md 12.3 — 결제 이력 판정 기준은 `subscriptions` 행의 존재 여부 하나다.
   * 무료(light)는 행이 생기지 않으므로, 행이 하나라도 있으면 결제 이력이 있는 것으로 본다.
   */
  async hasPaymentHistory(
    userId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.subscriptionRepository.existsByUserId(userId, manager);
  }

  /** 탈퇴 시 구독 만료 동의를 받아야 하는지 판정한다 (auth.md 4.3) */
  async hasLiveSubscription(
    userId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const count = await this.subscriptionRepository.countLiveByUserId(
      userId,
      manager,
    );
    return count > 0;
  }

  /**
   * 플랜 카드에 그릴 값을 조립한다 — **프로필·설정이 같은 함수를 호출한다**
   * (`settings-api.md` 4.1). 화면마다 조립하면 두 곳의 구독 표시가 어긋난다.
   *
   * **`users.tier` 캐시가 아니라 `subscriptions`를 기준으로 조립한다**(`profile-api.md` 3장 ·
   * domain.md 3.1). 캐시가 어긋나 있어도 여기서 고치지 않는다 — 갱신 경로는 결제 반영 한 곳이며,
   * 조회가 캐시를 쓰기 시작하면 갱신 지점이 흩어진다.
   */
  async buildPlanView(
    userId: string,
    manager?: EntityManager,
  ): Promise<PlanView> {
    const subscription = await this.findCurrent(userId, manager);

    this.warnIfContradictoryCancellation(userId, subscription);

    const status = toPlanStatus(subscription);
    const tier =
      status === PlanStatus.FREE ? UserTier.LIGHT : subscription!.tier;
    const plan = await this.planService.findByTier(tier, manager);

    return {
      status,
      tier,
      // 요금제 행이 없으면 티어값을 그대로 보여준다 — 카드가 빈 채로 나가는 것보다 낫다
      planName: plan?.name ?? tier,
      dailyPlayLimit: plan?.dailyPlayLimit ?? null,
      renewsAt:
        status === PlanStatus.SUBSCRIBED ? subscription!.expiresAt : null,
      expiresAt:
        status === PlanStatus.CANCEL_SCHEDULED || status === PlanStatus.GRACE
          ? subscription!.expiresAt
          : null,
      hasPaymentIssue: status === PlanStatus.GRACE,
    };
  }

  /**
   * **`cancelled`인데 자동 갱신이 켜져 있는 행은 생기면 안 된다**(domain.md 8.2 —
   * `cancelled`는 해지 예약이므로 정의상 `is_auto_renew = false`다).
   *
   * 생겼다면 S2S 환산이 잘못된 것이다 — 스토어마다 "cancel"이 가리키는 사건이 달라서
   * (Play는 해지 예약, Apple은 환불·철회) 필드명을 그대로 옮기면 이 조합이 만들어진다.
   *
   * 조회를 막지는 않는다. 만료 전이라 혜택이 살아 있는 것은 맞으므로 화면은 그대로 그리고,
   * **데이터가 어긋났다는 사실만 남긴다.**
   */
  private warnIfContradictoryCancellation(
    userId: string,
    subscription: Subscription | null,
  ): void {
    if (
      subscription?.status !== SubscriptionStatus.CANCELLED ||
      !subscription.isAutoRenew
    ) {
      return;
    }

    this.logger.warn('cancelled subscription has auto renew on', {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
      isAutoRenew: subscription.isAutoRenew,
    });
  }

  /**
   * 화면 표시용 현재 구독 — 없으면 `null`(무료 티어).
   *
   * **`users.tier` 캐시가 아니라 이 행이 진실의 원천이다**(domain.md 3.1 · 8.2).
   * 프로필·설정의 플랜 카드는 이 값으로 조립하고, 캐시 갱신은 이 모듈이 결제 반영 시점에
   * 한 곳에서만 수행한다 — 조회 경로가 캐시를 고치기 시작하면 갱신 지점이 흩어진다.
   */
  async findCurrent(
    userId: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findLatestByUserId(userId, manager);
  }

  /** 탈퇴 아카이브 이관용 조회 (domain.md 12.3) */
  async findAllByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Subscription[]> {
    return this.subscriptionRepository.findAllByUserId(userId, manager);
  }

  /** 탈퇴 파기. 아카이브 이관 뒤에 호출한다 */
  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.subscriptionRepository.deleteByUserId(userId, manager);
  }
}

/**
 * `subscriptions` 행을 화면 4분기로 정규화한다(`profile-api.md` 4.1 · domain.md 8.2).
 *
 * **`status`와 `is_auto_renew`의 조합으로 판정하고 `expires_at`을 다시 보지 않는다.**
 * 만료 반영은 스토어 서버 알림(S2S)이 `status`를 바꿔서 하는 일이므로, 조회 쪽에서 시각을
 * 비교해 앞질러 판정하면 진실의 원천이 둘이 된다.
 */
function toPlanStatus(subscription: Subscription | null): PlanStatus {
  if (!subscription) {
    return PlanStatus.FREE;
  }

  if (subscription.status === SubscriptionStatus.GRACE) {
    return PlanStatus.GRACE;
  }

  if (
    subscription.status === SubscriptionStatus.EXPIRED ||
    subscription.status === SubscriptionStatus.REFUNDED
  ) {
    return PlanStatus.FREE;
  }

  // active · cancelled — 만료 전이며, 갈리는 것은 자동 갱신 여부뿐이다(domain.md 8.2)
  return subscription.isAutoRenew
    ? PlanStatus.SUBSCRIBED
    : PlanStatus.CANCEL_SCHEDULED;
}
