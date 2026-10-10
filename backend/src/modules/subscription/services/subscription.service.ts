import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  isSignupTrialActive,
  toSignupTrialLastFreeDate,
} from '@/common/utils/signup-trial.util';
import { UserTier } from '@/modules/user/user.enum';

import { Subscription } from '../entities/subscription.entity';
import {
  isHigherTier,
  toInviteGrantLastDate,
} from '../policies/invite-code.policy';
import {
  SubscriptionDraft,
  SubscriptionRepository,
} from '../repositories/subscription.repository';
import {
  NON_TERMINAL_SUBSCRIPTION_STATUSES,
  PlanStatus,
  SubscriptionStatus,
} from '../subscription.enum';
import {
  InviteGrantView,
  PendingPlanView,
  PlanView,
  TrialContext,
  TrialView,
} from '../subscription.types';
import { InviteCodeService } from './invite-code.service';
import { moreGenerousLimit, PlanService } from './plan.service';

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
    private readonly inviteCodeService: InviteCodeService,
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
    trialContext: TrialContext,
    manager?: EntityManager,
  ): Promise<PlanView> {
    const subscription = await this.findCurrent(userId, manager);

    this.warnIfContradictoryCancellation(userId, subscription);

    const status = toPlanStatus(subscription);
    const baseTier =
      status === PlanStatus.FREE ? UserTier.LIGHT : subscription!.tier;
    const basePlan = await this.planService.findByTier(baseTier, manager);
    const baseLimit = basePlan?.dailyPlayLimit ?? null;

    /**
     * 가입 체험(`subscription.md` 4.8). **`status`는 건드리지 않는다** — 4분기는 구독 상태이고 체험은 그 위에
     * 얹히는 기간 한정 값이라, 값을 늘리면 옛 앱이 모르는 분기를 받는다. 무료 사용자만 `tier`·`planName`이
     * 체험 요금제로 바뀌고, 구독자는 구독 표시를 유지한 채 한도만 더 넉넉한 쪽이 된다.
     */
    const { trialEndsAt, now } = trialContext;
    const activeTrialEndsAt = isSignupTrialActive(trialEndsAt, now)
      ? trialEndsAt
      : null;
    const trialPlan = activeTrialEndsAt
      ? await this.planService.findByTier(UserTier.TRIAL, manager)
      : null;
    // 체험 요금제 행이 없으면 체험을 그리지 않는다 — 한도 판정도 그때는 원래 한도로 내려간다(`PlanService`)
    const trial: TrialView | null =
      activeTrialEndsAt && trialPlan
        ? {
            endsAt: activeTrialEndsAt,
            lastFreeDate: toSignupTrialLastFreeDate(activeTrialEndsAt),
            dailyPlayLimitAfter: baseLimit,
          }
        : null;
    // 다운그레이드 예약(KAN-161) — 살아 있는 구독에만 있다. 결제 반영 정책이 종결 때 `pending_tier`를 비우지만,
    // 무료로 그리는 상태에서는 값이 남아 있어도 보이지 않게 한 번 더 막는다
    const pendingTier =
      status !== PlanStatus.FREE ? (subscription?.pendingTier ?? null) : null;
    const pendingPlanRow = pendingTier
      ? await this.planService.findByTier(pendingTier, manager)
      : null;
    const pendingPlan: PendingPlanView | null = pendingTier
      ? {
          tier: pendingTier,
          planName: pendingPlanRow?.name ?? pendingTier,
          effectiveAt: subscription!.expiresAt,
        }
      : null;

    /**
     * 초대 코드 지급(`subscription-api.md` 4.8). 체험처럼 **`status`는 건드리지 않고**, 지급 요금제가 구독보다 높을 때만
     * `tier`·`planName`·한도가 지급 요금제가 된다 — `users.tier` 캐시(재생 한도·음질 판정)와 같은 규칙이다
     * (`BillingSyncService.syncUserTier`). `entitlements`도 이 `tier`로 조립되므로 화면 분기와 판정이 어긋나지 않는다.
     */
    const activeGrant = await this.inviteCodeService.findActiveGrant(
      userId,
      now,
      manager,
    );
    const grantPlan = activeGrant
      ? await this.planService.findByTier(activeGrant.redemption.tier, manager)
      : null;
    const grant: InviteGrantView | null = activeGrant
      ? {
          name: activeGrant.codeName,
          tier: activeGrant.redemption.tier,
          planName: grantPlan?.name ?? activeGrant.redemption.tier,
          endsAt: activeGrant.redemption.endsAt,
          lastDate: toInviteGrantLastDate(activeGrant.redemption.endsAt),
        }
      : null;
    const showsGrantPlan = grant !== null && isHigherTier(grant.tier, baseTier);

    const showsTrialPlan =
      !showsGrantPlan && trial !== null && status === PlanStatus.FREE;
    const tier = showsGrantPlan
      ? grant.tier
      : showsTrialPlan
        ? UserTier.TRIAL
        : baseTier;
    const plan = showsGrantPlan
      ? grantPlan
      : showsTrialPlan
        ? trialPlan
        : basePlan;
    // `null`이 무제한이라 `??`로 고르면 안 된다 — 요금제 행이 없을 때만 구독 한도로 내려간다
    const shownLimit =
      showsGrantPlan && grantPlan ? grantPlan.dailyPlayLimit : baseLimit;

    // 체험 뒤 한도 안내는 지급까지 반영한 값이어야 한다 — 지급 Pro 인데 "체험 뒤 하루 2편"이라고 하면 틀린 안내다
    const shownTrial =
      trial !== null && showsGrantPlan
        ? { ...trial, dailyPlayLimitAfter: shownLimit }
        : trial;

    return {
      status,
      tier,
      // 요금제 행이 없으면 티어값을 그대로 보여준다 — 카드가 빈 채로 나가는 것보다 낫다
      planName: plan?.name ?? tier,
      dailyPlayLimit:
        trial !== null && trialPlan
          ? moreGenerousLimit(shownLimit, trialPlan.dailyPlayLimit)
          : shownLimit,
      grant,
      trial: shownTrial,
      renewsAt:
        status === PlanStatus.SUBSCRIBED ? subscription!.expiresAt : null,
      expiresAt:
        status === PlanStatus.CANCEL_SCHEDULED || status === PlanStatus.GRACE
          ? subscription!.expiresAt
          : null,
      hasPaymentIssue: status === PlanStatus.GRACE,
      pendingPlan,
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
      user_id: userId,
      subscription_id: subscription.id,
      status: subscription.status,
      is_auto_renew: subscription.isAutoRenew,
    });
  }

  /**
   * 화면 표시용 현재 구독 — 없으면 `null`(무료 티어).
   *
   * **`users.tier` 캐시가 아니라 이 행이 진실의 원천이다**(domain.md 3.1 · 8.2).
   * 프로필·설정의 플랜 카드는 이 값으로 조립하고, 캐시 갱신은 이 모듈이 결제 반영 시점에
   * 한 곳에서만 수행한다 — 조회 경로가 캐시를 고치기 시작하면 갱신 지점이 흩어진다.
   *
   * 선택 규칙은 `selectCurrentSubscription` 참조. 한 사용자의 구독 행은 많아야 몇 개라
   * 전부 읽어 메모리에서 고른다.
   */
  async findCurrent(
    userId: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    const rows = await this.subscriptionRepository.findAllByUserId(
      userId,
      manager,
    );
    return selectCurrentSubscription(rows);
  }

  /** 스토어 구독의 자연 키로 찾는다(잠그지 않는다 — 주인 확인 등 읽기용) */
  async findByOriginalTransactionId(
    originalTransactionId: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findByOriginalTransactionId(
      originalTransactionId,
      manager,
    );
  }

  /** 마지막으로 반영한 영수증(Play 구매 토큰)으로 찾는다 — 토큰이 바뀐 구독을 기존 행에 잇는 데 쓴다 */
  async findByLatestReceipt(
    store: Subscription['store'],
    latestReceipt: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findByLatestReceipt(
      store,
      latestReceipt,
      manager,
    );
  }

  /**
   * 스토어 구독 한 건을 **잠가서** 가져온다 — 반영 직전에 부른다. 영수증 제출과 스토어 알림이 같은 구독을
   * 동시에 고치면 늦게 커밋한 쪽이 옛 값으로 덮기 때문이다.
   */
  async lockByOriginalTransactionId(
    originalTransactionId: string,
    manager: EntityManager,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findByOriginalTransactionIdForUpdate(
      originalTransactionId,
      manager,
    );
  }

  /**
   * 행이 없으면 만들고, **어느 쪽이든 잠근 행을 돌려준다.** 동시에 도착한 요청이 먼저 만들었으면
   * 유니크 충돌을 삼키고 그 행을 잠가 읽는다 — 호출부는 "만들었는가"만 구분하면 된다.
   */
  async createOrLock(
    draft: SubscriptionDraft,
    manager: EntityManager,
  ): Promise<{ subscription: Subscription; created: boolean }> {
    const created = await this.subscriptionRepository.insertIfAbsent(
      draft,
      manager,
    );
    const subscription =
      await this.subscriptionRepository.findByOriginalTransactionIdForUpdate(
        draft.originalTransactionId,
        manager,
      );

    if (!subscription) {
      throw new Error('subscription row disappeared after insert');
    }

    return { subscription, created };
  }

  async save(
    subscription: Subscription,
    manager?: EntityManager,
  ): Promise<Subscription> {
    return this.subscriptionRepository.save(subscription, manager);
  }

  /** 만료 보정 대상(`subscription-api.md` 4.2) — 만료가 `before`보다 과거인 비종결 행 */
  async findOverdue(before: Date, limit: number): Promise<Subscription[]> {
    return this.subscriptionRepository.findOverdue(before, limit);
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

/**
 * 여러 구독 행 중 "현재" 행을 고른다(KAN-40 추기, 2026-09-09 감사).
 *
 * **비종결 상태(`active` · `grace` · `cancelled`)를 우선하고, 없을 때만 최근 행으로 폴백한다.**
 * `expires_at DESC` 단건 선택은 연간 구독을 환불(`refunded`, 만료일은 먼 미래)한 뒤 월간을
 * 재구독한 사용자에게서 **환불 행을 골라 무료로 표시**했다. 종결 상태(`expired` · `refunded`)는
 * 권한이 없는 행이므로 살아 있는 행이 하나라도 있으면 끼어들 수 없다.
 *
 * 같은 묶음 안에서는 `expires_at DESC, started_at DESC` — 종전 정렬과 같다.
 */
export function selectCurrentSubscription(
  rows: readonly Subscription[],
): Subscription | null {
  if (rows.length === 0) {
    return null;
  }
  const live = rows.filter((row) =>
    NON_TERMINAL_SUBSCRIPTION_STATUSES.includes(row.status),
  );
  const pool = live.length > 0 ? live : rows;
  return [...pool].sort(byLatestExpiry)[0];
}

function byLatestExpiry(a: Subscription, b: Subscription): number {
  const byExpiry = b.expiresAt.getTime() - a.expiresAt.getTime();
  if (byExpiry !== 0) {
    return byExpiry;
  }
  return b.startedAt.getTime() - a.startedAt.getTime();
}
