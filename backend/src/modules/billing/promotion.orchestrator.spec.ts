import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { PromotionKind } from '@/modules/content-review/content-review.enum';
import { UserMarket, UserTier } from '@/modules/user/user.enum';

import {
  PromotionUnusableReason,
  resolvePromotionUnusableReason,
} from './promotion.policy';
import { PromotionOrchestrator } from './promotion.orchestrator';

// 2026-10-29(목) 12:00 KST
const NOW = new Date('2026-10-29T03:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROMOTION_ID = 'pppppppp-1111-4111-8111-111111111111';

function promotionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROMOTION_ID,
    userId: USER_ID,
    kind: PromotionKind.REVIEW_REWARD,
    tier: UserTier.PRO,
    grantDays: 7,
    issuedAt: new Date('2026-10-28T03:00:00.000Z'),
    expiresAt: new Date('2027-01-27T20:00:00.000Z'),
    redeemedAt: null,
    inviteCodeRedemptionId: null,
    ...overrides,
  };
}

async function capture(promise: Promise<unknown>): Promise<BusinessException> {
  try {
    await promise;
  } catch (error) {
    return error as BusinessException;
  }
  throw new Error('예외가 나지 않았다');
}

describe('resolvePromotionUnusableReason', () => {
  it.each([
    [null, false, null],
    [UserTier.DAILY, false, null],
    [UserTier.PRO, false, PromotionUnusableReason.PRO_SUBSCRIBED],
    [null, true, PromotionUnusableReason.GRANT_ACTIVE],
    [UserTier.DAILY, true, PromotionUnusableReason.GRANT_ACTIVE],
    // 둘 다면 Pro 구독 중이 앞선다(4.7 순서)
    [UserTier.PRO, true, PromotionUnusableReason.PRO_SUBSCRIBED],
  ])(
    '구독 %s · 다른 지급 %s → %s',
    (entitledTier, hasActiveGrant, expected) => {
      expect(
        resolvePromotionUnusableReason({ entitledTier, hasActiveGrant }),
      ).toBe(expected);
    },
  );
});

describe('PromotionOrchestrator', () => {
  // 운영과 같은 05:00 경계(2026-10-12 05:00 KST 전환)로 계산한다
  const switchKey = 'SERVICE_DAY_BOUNDARY_05_FROM';
  const previousSwitch = process.env[switchKey];
  beforeAll(() => {
    process.env[switchKey] = '2026-10-12T05:00:00+09:00';
  });
  afterAll(() => {
    if (previousSwitch === undefined) {
      delete process.env[switchKey];
    } else {
      process.env[switchKey] = previousSwitch;
    }
  });

  let orchestrator: PromotionOrchestrator;
  let order: string[];
  let contentReviewService: {
    save: jest.Mock;
    isEnabled: jest.Mock;
    getRewardProgress: jest.Mock;
  };
  let promotionService: {
    lockRedeemable: jest.Mock;
    markRedeemed: jest.Mock;
    findUsable: jest.Mock;
  };
  let subscriptionService: { findEntitled: jest.Mock };
  let inviteCodeService: {
    findActiveGrant: jest.Mock;
    grantReviewReward: jest.Mock;
  };
  let planService: { findByTier: jest.Mock };
  let userService: { getByIdForUpdate: jest.Mock; getById: jest.Mock };
  let billingSyncService: { syncUserTier: jest.Mock };
  let billingOrchestrator: { buildSubscriptionView: jest.Mock };

  const subscriptionView = { plan: { grant: null } };

  beforeEach(() => {
    order = [];
    const track =
      <T>(name: string, value: T) =>
      () => {
        order.push(name);
        return Promise.resolve(value);
      };
    contentReviewService = {
      save: jest.fn(),
      isEnabled: jest.fn().mockReturnValue(true),
      getRewardProgress: jest.fn().mockResolvedValue(null),
    };
    promotionService = {
      lockRedeemable: jest
        .fn()
        .mockImplementation(track('promotion', promotionRow())),
      markRedeemed: jest.fn().mockImplementation(track('mark', undefined)),
      findUsable: jest.fn().mockResolvedValue([promotionRow()]),
    };
    subscriptionService = { findEntitled: jest.fn().mockResolvedValue(null) };
    inviteCodeService = {
      findActiveGrant: jest.fn().mockResolvedValue(null),
      grantReviewReward: jest.fn().mockImplementation(
        track('grant', {
          redemption: {
            id: 'redemption-1',
            tier: UserTier.PRO,
            endsAt: new Date('2026-11-04T20:00:00.000Z'),
          },
        }),
      ),
    };
    planService = {
      findByTier: jest
        .fn()
        .mockResolvedValue({ tier: UserTier.PRO, name: 'Pro', nameEn: 'Pro' }),
    };
    userService = {
      getByIdForUpdate: jest.fn().mockImplementation(track('user', {})),
      getById: jest
        .fn()
        .mockResolvedValue({ market: UserMarket.KR, trialEndsAt: null }),
    };
    billingSyncService = {
      syncUserTier: jest.fn().mockImplementation(track('sync', undefined)),
    };
    billingOrchestrator = {
      buildSubscriptionView: jest.fn().mockResolvedValue(subscriptionView),
    };
    const dataSource = {
      transaction: jest.fn((work: (manager: unknown) => Promise<unknown>) =>
        work({}),
      ),
    };
    orchestrator = new PromotionOrchestrator(
      contentReviewService as never,
      promotionService as never,
      subscriptionService as never,
      inviteCodeService as never,
      planService as never,
      userService as never,
      billingSyncService as never,
      billingOrchestrator as never,
      dataSource as never,
    );
  });

  describe('redeem (4.7)', () => {
    it('무료 계정 — 사용자 → 프로모션 순으로 잠그고, 지급 행 · 사용 기록 · 티어 캐시를 한 트랜잭션에서 맞춘 뒤 구독 본문을 준다', async () => {
      const result = await orchestrator.redeem(USER_ID, PROMOTION_ID, NOW);

      expect(order).toEqual(['user', 'promotion', 'grant', 'mark', 'sync']);
      expect(inviteCodeService.grantReviewReward).toHaveBeenCalledWith(
        USER_ID,
        { tier: UserTier.PRO, grantDays: 7 },
        false,
        NOW,
        expect.anything(),
      );
      expect(promotionService.markRedeemed).toHaveBeenCalledWith(
        expect.objectContaining({ id: PROMOTION_ID }),
        'redemption-1',
        NOW,
        expect.anything(),
      );
      expect(result).toBe(subscriptionView);
    });

    it('데일리 구독 중이면 쓸 수 있고 "쓸 때 구독 중"으로 지급한다 — 갱신으로 지급이 끝나지 않는다', async () => {
      subscriptionService.findEntitled.mockResolvedValue({
        tier: UserTier.DAILY,
      });

      await orchestrator.redeem(USER_ID, PROMOTION_ID, NOW);

      expect(inviteCodeService.grantReviewReward).toHaveBeenCalledWith(
        USER_ID,
        expect.anything(),
        true,
        NOW,
        expect.anything(),
      );
    });

    it('Pro 구독 중이면 409 PROMOTION_PRO_SUBSCRIBED 이고 지급하지 않는다', async () => {
      subscriptionService.findEntitled.mockResolvedValue({
        tier: UserTier.PRO,
      });

      const error = await capture(
        orchestrator.redeem(USER_ID, PROMOTION_ID, NOW),
      );

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.errorCode).toBe(ErrorCode.PROMOTION_PRO_SUBSCRIBED);
      expect(inviteCodeService.grantReviewReward).not.toHaveBeenCalled();
      expect(promotionService.markRedeemed).not.toHaveBeenCalled();
    });

    it('다른 지급 이용 중이면 409 INVITE_GRANT_ALREADY_ACTIVE', async () => {
      inviteCodeService.findActiveGrant.mockResolvedValue({});

      const error = await capture(
        orchestrator.redeem(USER_ID, PROMOTION_ID, NOW),
      );

      expect(error.errorCode).toBe(ErrorCode.INVITE_GRANT_ALREADY_ACTIVE);
      expect(inviteCodeService.grantReviewReward).not.toHaveBeenCalled();
    });

    it('없음 · 이미 사용 · 기한 지남은 잠금 단계의 판정을 그대로 낸다 — 구독을 보기 전이다', async () => {
      promotionService.lockRedeemable.mockRejectedValue(
        new BusinessException({
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.PROMOTION_ALREADY_USED,
          message: '이미 사용한 프로모션이에요',
        }),
      );

      const error = await capture(
        orchestrator.redeem(USER_ID, PROMOTION_ID, NOW),
      );

      expect(error.errorCode).toBe(ErrorCode.PROMOTION_ALREADY_USED);
      expect(subscriptionService.findEntitled).not.toHaveBeenCalled();
    });
  });

  describe('listPromotions (4.6)', () => {
    it('카드는 시장 언어의 이름 · 마지막 사용일 · 지금 쓰면 끝나는 날을 싣고, 사유는 사용과 같은 판정이다', async () => {
      subscriptionService.findEntitled.mockResolvedValue({
        tier: UserTier.PRO,
      });
      userService.getById.mockResolvedValue({
        market: UserMarket.GLOBAL,
        trialEndsAt: null,
      });

      const screen = await orchestrator.listPromotions(USER_ID, NOW);

      expect(screen).toMatchObject({
        enabled: true,
        grant: null,
        hasUnused: true,
        rewardProgress: null,
      });
      expect(screen.promotions).toEqual([
        expect.objectContaining({
          id: PROMOTION_ID,
          name: 'Review',
          planName: 'Pro',
          grantDays: 7,
          lastUsableDate: '2027-01-27',
          redeemable: false,
          reason: PromotionUnusableReason.PRO_SUBSCRIBED,
          overlapsTrial: false,
          // 10-29 을 1일째로 7일 → 11-05 05:00 KST 에 끝나고 마지막 날은 11-04
          redeemPreview: {
            endsAt: new Date('2026-11-04T20:00:00.000Z'),
            lastDate: '2026-11-04',
          },
        }),
      ]);
    });

    it('가입 체험 중이면 overlaps_trial=true 이고 쓸 수 있다', async () => {
      userService.getById.mockResolvedValue({
        market: UserMarket.KR,
        trialEndsAt: new Date('2026-11-05T20:00:00.000Z'),
      });

      const [promotion] = (await orchestrator.listPromotions(USER_ID, NOW))
        .promotions;

      expect(promotion).toMatchObject({
        name: '후기 참여',
        redeemable: true,
        reason: null,
        overlapsTrial: true,
      });
    });

    it('가진 것이 없으면 빈 배열 · has_unused=false 이고 사용자 상태를 읽지 않는다', async () => {
      promotionService.findUsable.mockResolvedValue([]);

      const screen = await orchestrator.listPromotions(USER_ID, NOW);

      expect(screen).toMatchObject({ promotions: [], hasUnused: false });
      expect(userService.getById).not.toHaveBeenCalled();
    });
  });

  describe('saveContentReview (4.2)', () => {
    it('발급이 없으면 issued_promotion=null 이다', async () => {
      contentReviewService.save.mockResolvedValue({
        review: { stars: 4 },
        rewardProgress: { current: 1, required: 3 },
        issuedPromotion: null,
      });

      const result = await orchestrator.saveContentReview({
        userId: USER_ID,
        contentId: 'c',
        market: UserMarket.KR,
        stars: 4,
        text: null,
        now: NOW,
      });

      expect(result.issuedPromotion).toBeNull();
      expect(result.rewardProgress).toEqual({ current: 1, required: 3 });
    });

    it('이번 저장으로 발급됐으면 화면 모양으로 싣는다', async () => {
      contentReviewService.save.mockResolvedValue({
        review: { stars: 5 },
        rewardProgress: null,
        issuedPromotion: promotionRow(),
      });

      const result = await orchestrator.saveContentReview({
        userId: USER_ID,
        contentId: 'c',
        market: UserMarket.KR,
        stars: 5,
        text: '가나다라마바사아자차',
        now: NOW,
      });

      expect(result.issuedPromotion).toMatchObject({
        id: PROMOTION_ID,
        name: '후기 참여',
        redeemable: true,
      });
    });
  });
});
