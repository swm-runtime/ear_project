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
const NOW = new Date('2026-08-10T03:00:00.000Z');
/** 체험을 받지 않은 사용자 — 기존 판정이 그대로여야 한다 */
const NO_TRIAL = { trialEndsAt: null, now: NOW };
/** 8월 15일 04:00 KST에 끝나는 체험(마지막 날 8월 14일) */
const TRIAL_ENDS_AT = new Date('2026-08-14T19:00:00.000Z');

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
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

      // then — "하루 N편"의 N은 하드코딩이 아니라 plans 값이다
      expect(plan).toEqual({
        status: PlanStatus.FREE,
        tier: UserTier.LIGHT,
        planName: '라이트',
        dailyPlayLimit: 2,
        renewsAt: null,
        expiresAt: null,
        hasPaymentIssue: false,
        trial: null,
      });
    });

    it('만료된 행만 있으면 무료다', async () => {
      // given
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({ status: SubscriptionStatus.EXPIRED }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

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
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

      // then
      expect(plan.status).toBe(PlanStatus.FREE);
    });

    it('자동 갱신 중이면 구독 상태이고 다음 결제일을 내려준다', async () => {
      // given
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription(),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

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
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

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
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

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
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

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
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

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
      const plan = await service.buildPlanView(USER_ID, NO_TRIAL);

      // then
      expect(plan.planName).toBe(UserTier.PRO);
      expect(plan.dailyPlayLimit).toBeNull();
    });
  });
  describe('buildPlanView — 가입 체험(subscription.md 4.8)', () => {
    const lightPlan = buildPlan({
      tier: UserTier.LIGHT,
      name: '라이트',
      dailyPlayLimit: 2,
    });
    const dailyPlan = buildPlan({
      tier: UserTier.DAILY,
      name: '데일리',
      dailyPlayLimit: 5,
    });
    const trialPlan = buildPlan({
      tier: UserTier.TRIAL,
      name: '무료 체험',
      dailyPlayLimit: null,
    });
    const plansByTier = (tier: UserTier): Promise<Plan | null> =>
      Promise.resolve(
        { light: lightPlan, daily: dailyPlan, trial: trialPlan, pro: null }[
          tier
        ],
      );

    beforeEach(() => {
      planService.findByTier.mockImplementation(plansByTier);
    });

    it('무료 사용자가 체험 중이면 trial 요금제로 그리고 종료일·이후 한도를 싣는다', async () => {
      // when
      const plan = await service.buildPlanView(USER_ID, {
        trialEndsAt: TRIAL_ENDS_AT,
        now: NOW,
      });

      // then — status는 구독 상태(4분기)라 free 그대로다. 옛 앱은 "무료 이용 중"으로 그린다
      expect(plan).toMatchObject({
        status: PlanStatus.FREE,
        tier: UserTier.TRIAL,
        planName: '무료 체험',
        dailyPlayLimit: null,
        trial: {
          endsAt: TRIAL_ENDS_AT,
          lastFreeDate: '2026-08-14',
          dailyPlayLimitAfter: 2,
        },
      });
    });

    it('체험이 끝난 시각부터는 원래 무료 요금제로 돌아간다', async () => {
      const plan = await service.buildPlanView(USER_ID, {
        trialEndsAt: TRIAL_ENDS_AT,
        now: TRIAL_ENDS_AT,
      });

      expect(plan).toMatchObject({
        status: PlanStatus.FREE,
        tier: UserTier.LIGHT,
        dailyPlayLimit: 2,
        trial: null,
      });
    });

    it('체험 중 한도가 있는 요금제를 구독하면 표시는 구독을 따르고 한도는 더 넉넉한 쪽이다', async () => {
      // given — 데일리(하루 5편) 구독자인데 체험 기간이 남았다
      subscriptionRepository.findAllByUserId.mockResolvedValue([
        buildSubscription({ tier: UserTier.DAILY }),
      ]);

      // when
      const plan = await service.buildPlanView(USER_ID, {
        trialEndsAt: TRIAL_ENDS_AT,
        now: NOW,
      });

      // then — 돈을 내고 덜 듣게 되면 안 된다. 체험이 끝나면 5편으로 돌아간다고 알려 준다
      expect(plan).toMatchObject({
        status: PlanStatus.SUBSCRIBED,
        tier: UserTier.DAILY,
        planName: '데일리',
        dailyPlayLimit: null,
        trial: { lastFreeDate: '2026-08-14', dailyPlayLimitAfter: 5 },
      });
    });

    it('trial 요금제 행이 없으면 체험을 그리지 않는다 — 한도 판정도 그때는 원래 한도다', async () => {
      // given
      planService.findByTier.mockImplementation((tier) =>
        tier === UserTier.TRIAL ? Promise.resolve(null) : plansByTier(tier),
      );

      // when
      const plan = await service.buildPlanView(USER_ID, {
        trialEndsAt: TRIAL_ENDS_AT,
        now: NOW,
      });

      // then
      expect(plan).toMatchObject({
        tier: UserTier.LIGHT,
        dailyPlayLimit: 2,
        trial: null,
      });
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
