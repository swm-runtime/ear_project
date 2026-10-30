import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { EnvironmentVariables } from '@/config/env.validation';
import { UserTier } from '@/modules/user/user.enum';

import { CONTENT_REVIEW_REWARD_GRANT_DAYS } from './content-review.constant';
import { PromotionKind } from './content-review.enum';
import { AdminPromotionCounts } from './content-review.types';
import { Promotion } from './entities/promotion.entity';
import {
  isPromotionExpired,
  resolvePromotionExpiresAt,
} from './policies/promotion.policy';
import { PromotionRepository } from './promotion.repository';

/**
 * 후기 참여 프로모션 행(domain.md 8.7)의 소유 Service. **행만 다룬다** — 사용으로 생기는 지급(`invite_code_redemptions`)과
 * `users.tier` 캐시는 결제 반영 경로라 `billing`이 이 Service와 `subscription` · `user`를 한 트랜잭션에서 조합한다.
 */
@Injectable()
export class PromotionService {
  constructor(
    private readonly promotionRepository: PromotionRepository,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** 발급 스위치(2.1) — 값이 정확히 `true`일 때만 켜진다. 끄면 새 발급만 멈춘다 */
  isRewardEnabled(): boolean {
    return (
      this.configService
        .get('CONTENT_REVIEW_REWARD_ENABLED', { infer: true })
        ?.trim() === 'true'
    );
  }

  /** 받은 적 있는가 — 사용 · 소멸 포함(계정당 전체 1회) */
  async hasIssued(userId: string, manager?: EntityManager): Promise<boolean> {
    return this.promotionRepository.existsByUserIdAndKind(
      userId,
      PromotionKind.REVIEW_REWARD,
      manager,
    );
  }

  /** 발급 — 이미 있으면 `null`(유니크가 막는다). 요금제 · 일수 · 소멸 시각은 발급 때 값으로 남긴다 */
  async issueReviewReward(
    userId: string,
    now: Date,
    manager: EntityManager,
  ): Promise<Promotion | null> {
    return this.promotionRepository.insertIfAbsent(
      {
        userId,
        kind: PromotionKind.REVIEW_REWARD,
        tier: UserTier.PRO,
        grantDays: CONTENT_REVIEW_REWARD_GRANT_DAYS,
        issuedAt: now,
        expiresAt: resolvePromotionExpiresAt(now),
      },
      manager,
    );
  }

  /** S12 목록 — 쓰지 않았고 소멸 전인 것만, 발급 최신순 */
  async findUsable(userId: string, now: Date): Promise<Promotion[]> {
    return this.promotionRepository.findUsableByUserId(userId, now);
  }

  /**
   * 사용 판정의 앞 세 단계(`content-review-api.md` 4.7 순서 1~3) — 잠그고 본다. **호출자가 사용자 행을 먼저 잠가야 한다**
   * (사용자 → 프로모션 순서 — 두 기기의 동시 사용이 한 번만 지급된다). 남의 것은 없는 것과 같다(404).
   */
  async lockRedeemable(
    userId: string,
    promotionId: string,
    now: Date,
    manager: EntityManager,
  ): Promise<Promotion> {
    const promotion = await this.promotionRepository.lockById(
      promotionId,
      manager,
    );

    if (promotion === null || promotion.userId !== userId) {
      throw promotionError(
        HttpStatus.NOT_FOUND,
        ErrorCode.PROMOTION_NOT_FOUND,
        '프로모션을 찾을 수 없어요',
      );
    }
    if (promotion.redeemedAt !== null) {
      throw promotionError(
        HttpStatus.CONFLICT,
        ErrorCode.PROMOTION_ALREADY_USED,
        '이미 사용한 프로모션이에요',
      );
    }
    if (isPromotionExpired(promotion.expiresAt, now)) {
      throw promotionError(
        HttpStatus.CONFLICT,
        ErrorCode.PROMOTION_EXPIRED,
        '사용 기한이 지난 프로모션이에요',
      );
    }

    return promotion;
  }

  /** 사용 기록 — 지급 행 생성과 같은 트랜잭션에서 */
  async markRedeemed(
    promotion: Promotion,
    inviteCodeRedemptionId: string,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    promotion.redeemedAt = now;
    promotion.inviteCodeRedemptionId = inviteCodeRedemptionId;
    await this.promotionRepository.save(promotion, manager);
  }

  /** 관리자 건수(4.8) */
  async countReviewRewards(now: Date): Promise<AdminPromotionCounts> {
    return this.promotionRepository.countByKind(
      PromotionKind.REVIEW_REWARD,
      now,
    );
  }
}

/** 정상 앱은 흐린 버튼 · 재조회로 먼저 막으므로 드물다 — 경보 대상이 아니다 */
function promotionError(
  status: HttpStatus,
  errorCode: ErrorCode,
  message: string,
): BusinessException {
  return new BusinessException({
    status,
    errorCode,
    message,
    logLevel: 'info',
  });
}
