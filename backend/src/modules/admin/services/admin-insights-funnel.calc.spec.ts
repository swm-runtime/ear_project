import { serviceDateStart } from '@/common/utils/service-date.util';
import { UserMarket } from '@/modules/user/user.enum';

import {
  InsightsFunnelCohort,
  InsightsFunnelCohortCounts,
} from '../admin.types';
import {
  buildFunnelCohort,
  summarizeFunnelSteps,
} from './admin-insights-funnel.calc';
import { AdminInsightsService } from './admin-insights.service';

const windows = { firstPlayHours: 24, habitDays: 14 };

const counts = (
  over: Partial<InsightsFunnelCohortCounts> = {},
): InsightsFunnelCohortCounts => ({
  weekStart: '2026-10-05',
  signups: 100,
  onboardingCompleted: 80,
  firstPlay24h: 60,
  firstPlayEver: 70,
  firstComplete: 30,
  w1Return: 40,
  habit14d: 20,
  paidEver: 2,
  ...over,
});

const cohort = (
  over: Partial<InsightsFunnelCohort> = {},
): InsightsFunnelCohort => ({
  weekStart: '2026-10-05',
  inProgress: false,
  signups: 100,
  onboardingCompleted: 80,
  firstPlay24h: 60,
  firstPlayEver: 70,
  firstComplete: 30,
  w1Return: 40,
  w1Partial: false,
  habit14d: 20,
  paidEver: 2,
  ...over,
});

describe('가입 퍼널 순수 계산', () => {
  describe('buildFunnelCohort — 성숙·부분 판정', () => {
    // 2026-10-05 주 = [10-05 05:00 KST, 10-12 05:00 KST)
    const endAt = new Date('2026-10-11T20:00:00.000Z');

    it('묶음 끝 + 24시간 전에는 첫 재생 24h 가 null, 지나면 숫자다', () => {
      const before = buildFunnelCohort(
        counts(),
        endAt,
        new Date(endAt.getTime() + 23 * 3_600_000),
        '2026-10-13',
        '2026-09-01',
        windows,
      );
      expect(before.firstPlay24h).toBeNull();
      expect(before.inProgress).toBe(false);
      const after = buildFunnelCohort(
        counts(),
        endAt,
        new Date(endAt.getTime() + 24 * 3_600_000),
        '2026-10-13',
        '2026-09-01',
        windows,
      );
      expect(after.firstPlay24h).toBe(60);
      expect(after.habit14d).toBeNull();
    });

    it('W1 은 weekStart + 20 일이 오늘(KST) 전일 때만, 14일 습관은 끝 + 14일이 지난 뒤에만 숫자다', () => {
      const atDay20 = buildFunnelCohort(
        counts(),
        endAt,
        new Date('2026-10-25T03:00:00.000Z'),
        '2026-10-25',
        '2026-09-01',
        windows,
      );
      expect(atDay20.w1Return).toBeNull();
      expect(atDay20.habit14d).toBeNull();
      const atDay21 = buildFunnelCohort(
        counts(),
        endAt,
        new Date('2026-10-26T03:00:00.000Z'),
        '2026-10-26',
        '2026-09-01',
        windows,
      );
      expect(atDay21.w1Return).toBe(40);
      expect(atDay21.habit14d).toBe(20);
    });

    it('W1 첫날(weekStart + 7)이 신뢰 경계 앞이면 w1Partial, 진행 중인 주는 inProgress', () => {
      const c = buildFunnelCohort(
        counts(),
        endAt,
        new Date('2026-10-10T00:00:00.000Z'),
        '2026-10-10',
        '2026-10-13',
        windows,
      );
      expect(c.w1Partial).toBe(true);
      expect(c.inProgress).toBe(true);
      expect(
        buildFunnelCohort(
          counts(),
          endAt,
          new Date('2026-11-01T00:00:00.000Z'),
          '2026-11-01',
          '2026-10-12',
          windows,
        ).w1Partial,
      ).toBe(false);
    });
  });

  describe('summarizeFunnelSteps — 단계 전환율과 가장 큰 이탈', () => {
    it('성숙한 묶음만 합쳐(Σ이 단계 / Σ앞 단계) 비율을 내고, 가장 큰 이탈 단계를 고른다', () => {
      const { steps, largestDropStep } = summarizeFunnelSteps([
        cohort(),
        cohort({
          signups: 100,
          onboardingCompleted: 60,
          firstPlay24h: 30,
          firstComplete: 20,
          w1Return: 30,
          habit14d: 10,
          paidEver: 0,
        }),
        // 진행 중인 주 — 어떤 단계에도 들지 않는다
        cohort({ inProgress: true, signups: 10, onboardingCompleted: 0 }),
      ]);
      const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
      expect(byKey.signups).toEqual({
        key: 'signups',
        matureCohorts: 2,
        rate: null,
        drop: null,
      });
      expect(byKey.onboarding_completed.rate).toBeCloseTo(140 / 200);
      expect(byKey.first_play_24h.rate).toBeCloseTo(90 / 140);
      expect(byKey.first_complete.rate).toBeCloseTo(50 / 90);
      // W1 은 앞 단계(완청)보다 많을 수 있다 — 이탈은 0 으로 자른다
      expect(byKey.w1_return.rate).toBeCloseTo(70 / 50);
      expect(byKey.w1_return.drop).toBe(0);
      expect(byKey.paid_ever.rate).toBeCloseTo(2 / 30);
      // 결제 단계 이탈(1 - 2/30 ≈ 0.93)이 가장 크다
      expect(largestDropStep).toBe('paid_ever');
    });

    it('끝나지 않은 칸(null)·W1 partial·앞 단계 0 인 묶음은 그 단계 판정에서 빠진다', () => {
      const { steps } = summarizeFunnelSteps([
        cohort({ w1Return: null, habit14d: null }),
        cohort({ w1Partial: true }),
        cohort({ firstComplete: 0, w1Return: 5 }),
      ]);
      const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
      // w1: 첫째 null · 둘째 partial · 셋째 앞 단계 0 → 판정 묶음 없음
      expect(byKey.w1_return).toMatchObject({
        matureCohorts: 0,
        rate: null,
        drop: null,
      });
      // habit: 앞 단계(W1)가 판정된 묶음은 셋째뿐
      expect(byKey.habit_14d.matureCohorts).toBe(1);
      expect(byKey.habit_14d.rate).toBeCloseTo(20 / 5);
    });

    it('판정할 단계가 하나도 없으면 가장 큰 이탈은 null 이다', () => {
      expect(
        summarizeFunnelSteps([cohort({ inProgress: true })]).largestDropStep,
      ).toBeNull();
      expect(summarizeFunnelSteps([]).largestDropStep).toBeNull();
    });
  });
});

describe('AdminInsightsService.signupFunnel — 창 계산', () => {
  it('가입 주(서비스 주)로 weeks 개(이번 주 포함, 최근 먼저)를 만들고 묶음 경계를 서비스 날짜 시작 시각으로 넘긴다', async () => {
    // given — 2026-10-28(수) KST 12:00
    const now = new Date('2026-10-28T03:00:00.000Z');
    const repository = {
      funnelCohorts: jest.fn().mockResolvedValue([]),
      activeDatesFirstRecordedAt: jest.fn().mockResolvedValue(null),
    };
    const service = new AdminInsightsService(repository as never);

    // when — 범위 밖 주 수는 4~12 로 자른다
    const funnel = await service.signupFunnel(100, now, UserMarket.KR);

    // then
    expect(funnel.weeks).toBe(12);
    const [ranges, options, market] = repository.funnelCohorts.mock
      .calls[0] as [
      { weekStart: string; startAt: Date; endAt: Date }[],
      unknown,
      UserMarket,
    ];
    expect(market).toBe(UserMarket.KR);
    expect(options).toEqual({
      firstPlayHours: 24,
      habitDays: 14,
      minPlayDays: 3,
    });
    expect(ranges).toHaveLength(12);
    expect(ranges[0].weekStart).toBe('2026-10-26');
    expect(ranges[11].weekStart).toBe('2026-08-10');
    expect(ranges[0].startAt.getTime()).toBe(
      serviceDateStart('2026-10-26').getTime(),
    );
    expect(ranges[0].endAt.getTime()).toBe(
      serviceDateStart('2026-11-02').getTime(),
    );
    // 이번 주 묶음은 진행 중 · 빈 묶음도 0 으로 행이 있다
    expect(funnel.cohorts).toHaveLength(12);
    expect(funnel.cohorts[0]).toMatchObject({
      inProgress: true,
      signups: 0,
      firstPlay24h: null,
      w1Return: null,
      habit14d: null,
    });
    expect(funnel.cohorts[11].inProgress).toBe(false);
  });
});
