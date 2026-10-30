import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { isSignupTrialActive } from '@/common/utils/signup-trial.util';
import { ContentReviewService } from '@/modules/content-review/content-review.service';
import { SaveContentReviewCommand } from '@/modules/content-review/content-review.types';
import { Promotion } from '@/modules/content-review/entities/promotion.entity';
import { toPromotionLastUsableDate } from '@/modules/content-review/policies/promotion.policy';
import { PromotionService } from '@/modules/content-review/promotion.service';
import {
  resolveInviteGrantEndsAt,
  toInviteGrantLastDate,
} from '@/modules/subscription/policies/invite-code.policy';
import { planTextOf } from '@/modules/subscription/policies/plan-text.policy';
import { InviteCodeService } from '@/modules/subscription/services/invite-code.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { REVIEW_REWARD_GRANT_NAME } from '@/modules/subscription/subscription.constant';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { BillingOrchestrator } from './billing.orchestrator';
import { SubscriptionView } from './billing.types';
import {
  PromotionUnusableReason,
  resolvePromotionUnusableReason,
} from './promotion.policy';
import {
  PromotionScreenView,
  PromotionView,
  SaveContentReviewView,
} from './promotion.types';
import { BillingSyncService } from './services/billing-sync.service';

/**
 * 후기 참여 프로모션의 결제 반영 쪽(`content-review-api.md` 4.2 발급 응답 · 4.6 S12 · 4.7 사용 — KAN-279).
 *
 * 프로모션 **행**은 `content-review`가 소유하고(domain.md 8.7), 화면 값(쓸 수 있는지 · 사유 · 요금제 이름 · 체험 겹침)과 **지급**은
 * 구독 · 초대 코드 지급 · 사용자 상태가 필요해 여기서 조합한다(domain.md 2장 — `content-review`는 `billing` · `subscription`을
 * 모른다). **지급은 초대 코드 기간 지급과 같은 경로**다 — 내부 캠페인 행 `REVIEW-REWARD`의 지급 행을 만들고 같은 트랜잭션에서
 * `syncUserTier`로 `users.tier` 캐시를 맞춘다. 끝나면 기존 만료 배치가 되돌린다.
 */
@Injectable()
export class PromotionOrchestrator {
  private readonly logger = new Logger(PromotionOrchestrator.name);

  constructor(
    private readonly contentReviewService: ContentReviewService,
    private readonly promotionService: PromotionService,
    private readonly subscriptionService: SubscriptionService,
    private readonly inviteCodeService: InviteCodeService,
    private readonly planService: PlanService,
    private readonly userService: UserService,
    private readonly billingSyncService: BillingSyncService,
    private readonly billingOrchestrator: BillingOrchestrator,
    private readonly dataSource: DataSource,
  ) {}

  /** 4.2 — 후기 저장. 이번 저장으로 발급됐으면 그 프로모션을 화면 모양으로 싣는다 */
  async saveContentReview(
    command: SaveContentReviewCommand,
  ): Promise<SaveContentReviewView> {
    const result = await this.contentReviewService.save(command);
    const [issuedPromotion] =
      result.issuedPromotion === null
        ? [null]
        : await this.toPromotionViews(
            command.userId,
            [result.issuedPromotion],
            command.now,
          );

    return {
      review: result.review,
      rewardProgress: result.rewardProgress,
      issuedPromotion,
    };
  }

  /**
   * 4.6 — S12. 후기 스위치가 꺼져 있어도 열려 있다(가진 프로모션은 쓸 수 있다). `grant`는 구독 조회의 `plan.grant`와 같은
   * 조립 함수의 값이다.
   */
  async listPromotions(
    userId: string,
    now: Date,
  ): Promise<PromotionScreenView> {
    const [subscription, rows, rewardProgress] = await Promise.all([
      this.billingOrchestrator.buildSubscriptionView(userId, now),
      this.promotionService.findUsable(userId, now),
      this.contentReviewService.getRewardProgress(userId),
    ]);

    return {
      enabled: this.contentReviewService.isEnabled(),
      grant: subscription.plan.grant,
      promotions: await this.toPromotionViews(userId, rows, now),
      hasUnused: rows.length > 0,
      rewardProgress,
    };
  }

  /**
   * 4.7 — 사용. 판정 순서가 곧 에러 우선순위다: 없음 · 남의 것(404) → 이미 사용(409) → 기한 지남(409) → Pro 구독 중(409) →
   * 다른 지급 이용 중(409 `INVITE_GRANT_ALREADY_ACTIVE`).
   *
   * **사용자 행 → 프로모션 행** 순으로 잠그고 판정한다 — 두 기기의 동시 [쓰기]도 지급은 하나이고 늦은 쪽은 이미 사용이다.
   * 잠금 순서(사용자 → 프로모션 → 코드)는 결제 반영(구독 → 사용자 → 지급)과 순환을 만들지 않는다(domain.md 8.6 · 8.7).
   * 응답은 구독 조회와 같은 본문이다(초대 코드 입력과 같은 조립).
   */
  async redeem(
    userId: string,
    promotionId: string,
    now: Date,
  ): Promise<SubscriptionView> {
    const granted = await this.dataSource.transaction(async (manager) => {
      await this.userService.getByIdForUpdate(userId, manager);
      const promotion = await this.promotionService.lockRedeemable(
        userId,
        promotionId,
        now,
        manager,
      );
      const entitled = await this.subscriptionService.findEntitled(
        userId,
        manager,
      );
      const activeGrant = await this.inviteCodeService.findActiveGrant(
        userId,
        now,
        manager,
      );
      const reason = resolvePromotionUnusableReason({
        entitledTier: entitled?.tier ?? null,
        hasActiveGrant: activeGrant !== null,
      });

      if (reason === PromotionUnusableReason.PRO_SUBSCRIBED) {
        throw redeemError(
          ErrorCode.PROMOTION_PRO_SUBSCRIBED,
          'Pro 구독 중에는 쓸 수 없어요. 구독이 끝난 뒤 쓸 수 있어요',
        );
      }
      if (reason === PromotionUnusableReason.GRANT_ACTIVE) {
        throw redeemError(
          ErrorCode.INVITE_GRANT_ALREADY_ACTIVE,
          '이용 중인 프로모션이 끝난 뒤 쓸 수 있어요',
        );
      }

      // "쓸 때 살아 있던 구독"은 초대 코드 입력과 같은 술어다 — 데일리 구독 중에 쓴 지급은 그 구독의 갱신으로 끝나지 않는다
      const grant = await this.inviteCodeService.grantReviewReward(
        userId,
        { tier: promotion.tier, grantDays: promotion.grantDays },
        entitled !== null,
        now,
        manager,
      );
      await this.promotionService.markRedeemed(
        promotion,
        grant.redemption.id,
        now,
        manager,
      );
      await this.billingSyncService.syncUserTier(userId, manager, now);

      return grant;
    });

    this.logger.log('review reward promotion redeemed', {
      user_id: userId,
      promotion_id: promotionId,
      redemption_id: granted.redemption.id,
      tier: granted.redemption.tier,
      ends_at: granted.redemption.endsAt.toISOString(),
    });

    return this.billingOrchestrator.buildSubscriptionView(userId, now);
  }

  /** 프로모션 행 → 화면 모양. 사유 판정은 사용(`redeem`)과 같은 술어를 쓴다 */
  private async toPromotionViews(
    userId: string,
    rows: Promotion[],
    now: Date,
  ): Promise<PromotionView[]> {
    if (rows.length === 0) {
      return [];
    }

    const [user, entitled, activeGrant] = await Promise.all([
      this.userService.getById(userId),
      this.subscriptionService.findEntitled(userId),
      this.inviteCodeService.findActiveGrant(userId, now),
    ]);
    const reason = resolvePromotionUnusableReason({
      entitledTier: entitled?.tier ?? null,
      hasActiveGrant: activeGrant !== null,
    });
    const planNames = new Map<UserTier, string>();
    for (const tier of new Set(rows.map((row) => row.tier))) {
      const plan = await this.planService.findByTier(tier);
      // 요금제 행이 없으면 티어값 그대로 — 구독 조회의 플랜 이름 규칙과 같다
      planNames.set(tier, plan ? planTextOf(plan, user.market).name : tier);
    }

    return rows.map((row) => {
      const previewEndsAt = resolveInviteGrantEndsAt(
        { grantDays: row.grantDays, grantUntilDate: null },
        now,
      );

      return {
        id: row.id,
        kind: row.kind,
        name: REVIEW_REWARD_GRANT_NAME[user.market],
        tier: row.tier,
        planName: planNames.get(row.tier) ?? row.tier,
        grantDays: row.grantDays,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
        lastUsableDate: toPromotionLastUsableDate(row.expiresAt),
        redeemable: reason === null,
        reason,
        overlapsTrial: isSignupTrialActive(user.trialEndsAt, now),
        redeemPreview: {
          endsAt: previewEndsAt,
          lastDate: toInviteGrantLastDate(previewEndsAt),
        },
      };
    });
  }
}

/** 정상 앱은 흐린 버튼으로 먼저 막아 드물다(그사이 결제 · 코드 입력) — 경보 대상이 아니다 */
function redeemError(errorCode: ErrorCode, message: string): BusinessException {
  return new BusinessException({
    status: HttpStatus.CONFLICT,
    errorCode,
    message,
    logLevel: 'info',
  });
}
