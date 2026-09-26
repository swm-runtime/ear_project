import { Logger } from '@nestjs/common';

import { UserTier } from '@/modules/user/user.enum';

import { Plan } from '../entities/plan.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { PlanStatus, SubscriptionStatus } from '../subscription.enum';
import { PlanService } from './plan.service';
import {
  selectCurrentSubscription,
  SubscriptionService,
} from './subscription.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EXPIRES_AT = new Date('2026-09-01T00:00:00.000Z');

function buildSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: 'sub-1',
    userId: USER_ID,
    tier: UserTier.PRO,
    status: SubscriptionStatus.ACTIVE,
    isAutoRenew: true,
    startedAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: EXPIRES_AT,
    ...overrides,
  } as Subscription;
}

function buildPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    tier: UserTier.PRO,
    name: '프로',
    dailyPlayLimit: null,
    ...overrides,
  } as Plan;
}

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subscriptionRepository: jest.Mocked<
    Pick<SubscriptionRepository, 'findAllByUserId'>
  >;
  let planService: jest.Mocked<Pick<PlanService, 'findByTier'>>;

  beforeEach(() => {
    subscriptionRepository = {
      findAllByUserId: jest.fn().mockResolvedValue([]),
    };
    planService = { findByTier: jest.fn().mockResolvedValue(buildPlan()) };

    service = new SubscriptionService(
      subscriptionRepository as unknown as SubscriptionRepository,
      planService as unknown as PlanService,
    );
  });

  describe('buildPlanView', () => {
    it('구독 행이 없으면 무료로 판정하고 요금제 한도를 함께 내려준다', async () => {
      // given — 무료 사용자는 subscriptions 행이 없다(domain.md 8.2)
      subscriptionRepository.findAllByUserId.mockResolvedValue([]);
      planService.findByTier.mockResolvedValue(
        buildPlan({ tier: UserTier.LIGHT, name: '라이트', dailyPlayLimit: 2 }),
      );

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then — "하루 N편"의 N은 하드코딩이 아니라 plans 값이다
      expect(plan).toEqual({
        status: PlanStatus.FREE,
        tier: UserTier.LIGHT,
        planName: '라이트',
        dailyPlayLimit: 2,
        renewsAt: null,
        expiresAt: null,
        hasPaymentIssue: false,
      });
    });

    it('만료된 행만 있으면 무료다', async () => {
      // given
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({ status: SubscriptionStatus.EXPIRED }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then
      expect(plan.status).toBe(PlanStatus.FREE);
      expect(plan.tier).toBe(UserTier.LIGHT);
    });

    it('환불된 행만 있으면 무료다', async () => {
      // given — 환불·철회는 즉시 무효다(domain.md 8.2)
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({ status: SubscriptionStatus.REFUNDED }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then
      expect(plan.status).toBe(PlanStatus.FREE);
    });

    it('자동 갱신 중이면 구독 상태이고 다음 결제일을 내려준다', async () => {
      // given
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription(),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then — renews_at과 expires_at은 같은 컬럼이지만 의미가 달라 필드를 나눈다
      expect(plan).toMatchObject({
        status: PlanStatus.SUBSCRIBED,
        tier: UserTier.PRO,
        planName: '프로',
        renewsAt: EXPIRES_AT,
        expiresAt: null,
      });
    });

    it('자동 갱신이 꺼져 있으면 해지 예약이고 이용 종료일을 내려준다', async () => {
      // given
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({ isAutoRenew: false }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then
      expect(plan).toMatchObject({
        status: PlanStatus.CANCEL_SCHEDULED,
        renewsAt: null,
        expiresAt: EXPIRES_AT,
      });
    });

    it('해지 예약(cancelled) 행은 만료 전이므로 무료로 내리지 않는다', async () => {
      // given — domain.md 8.2: cancelled는 해지 예약이라 만료일까지 혜택이 살아 있다.
      // 즉시 무효인 환불·철회는 refunded가 맡는다
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({
          status: SubscriptionStatus.CANCELLED,
          isAutoRenew: false,
        }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then
      expect(plan).toMatchObject({
        status: PlanStatus.CANCEL_SCHEDULED,
        tier: UserTier.PRO,
        expiresAt: EXPIRES_AT,
      });
    });

    it('cancelled인데 자동 갱신이 켜져 있으면 경고를 남기되 화면은 그대로 그린다', async () => {
      // given — 생기면 안 되는 조합이다(domain.md 8.2). S2S 환산이 잘못된 경우다
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({
          status: SubscriptionStatus.CANCELLED,
          isAutoRenew: true,
        }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then — 만료 전이라 혜택은 살아 있으므로 조회를 막지 않는다
      expect(plan.status).toBe(PlanStatus.SUBSCRIBED);
      expect(warn).toHaveBeenCalledWith(
        'cancelled subscription has auto renew on',
        expect.objectContaining({ user_id: USER_ID }),
      );

      warn.mockRestore();
    });

    it('결제 유예 상태면 경고 플래그를 세우고 이용 종료일을 내려준다', async () => {
      // given
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({ status: SubscriptionStatus.GRACE }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then
      expect(plan).toMatchObject({
        status: PlanStatus.GRACE,
        hasPaymentIssue: true,
        expiresAt: EXPIRES_AT,
      });
    });

    it('요금제 행이 없으면 카드가 비지 않도록 티어값을 이름으로 쓴다', async () => {
      // given — 유료 플랜 행이 아직 없는 현재 상태에서 카드가 빈 채로 나가지 않게 한다
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription(),
      ]);
      planService.findByTier.mockResolvedValue(null);

      // when
      const plan = await service.buildPlanView(USER_ID);

      // then
      expect(plan.planName).toBe(UserTier.PRO);
      expect(plan.dailyPlayLimit).toBeNull();
    });
  });
});

describe('selectCurrentSubscription', () => {
  it('행이 없으면 null이다', () => {
    expect(selectCurrentSubscription([])).toBeNull();
  });

  it('환불된 연간 구독의 만료일이 더 늦어도 살아 있는 월간 구독을 고른다', () => {
    const refundedYearly = buildSubscription({
      id: 'yearly',
      status: SubscriptionStatus.REFUNDED,
      expiresAt: new Date('2027-08-01T00:00:00.000Z'),
    });
    const activeMonthly = buildSubscription({
      id: 'monthly',
      status: SubscriptionStatus.ACTIVE,
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(selectCurrentSubscription([refundedYearly, activeMonthly])?.id).toBe(
      'monthly',
    );
  });

  it('해지 예약(cancelled)은 만료 전이므로 종결 행보다 우선한다', () => {
    const expired = buildSubscription({
      id: 'expired',
      status: SubscriptionStatus.EXPIRED,
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });
    const cancelled = buildSubscription({
      id: 'cancelled',
      status: SubscriptionStatus.CANCELLED,
      isAutoRenew: false,
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(selectCurrentSubscription([expired, cancelled])?.id).toBe(
      'cancelled',
    );
  });

  it('살아 있는 행이 여럿이면 만료일이 가장 늦은 행이다', () => {
    const shorter = buildSubscription({
      id: 'shorter',
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    });
    const longer = buildSubscription({
      id: 'longer',
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    });

    expect(selectCurrentSubscription([shorter, longer])?.id).toBe('longer');
  });

  it('살아 있는 행이 없으면 종결 행 중 최근 행으로 폴백한다(무료로 그려진다)', () => {
    const older = buildSubscription({
      id: 'older',
      status: SubscriptionStatus.EXPIRED,
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const newer = buildSubscription({
      id: 'newer',
      status: SubscriptionStatus.REFUNDED,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(selectCurrentSubscription([older, newer])?.id).toBe('newer');
  });

  it('만료일이 같으면 시작일이 늦은 행이다', () => {
    const first = buildSubscription({
      id: 'first',
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const second = buildSubscription({
      id: 'second',
      startedAt: new Date('2026-08-15T00:00:00.000Z'),
    });

    expect(selectCurrentSubscription([first, second])?.id).toBe('second');
  });
});
