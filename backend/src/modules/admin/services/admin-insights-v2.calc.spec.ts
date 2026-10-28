import { serviceDateStart } from '@/common/utils/service-date.util';
import { UserMarket } from '@/modules/user/user.enum';

import { NORTH_STAR_MIN_PLAY_DAYS } from '../admin.constant';
import {
  InsightsFunnelCohort,
  InsightsFunnelCohortCounts,
  InsightsSegmentCountsRow,
} from '../admin.types';
import {
  buildFunnelCohort,
  buildNorthStar,
  buildSegments,
  daysElapsedInWeek,
  summarizeFunnelSteps,
} from './admin-insights-v2.calc';
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

const segRow = (
  over: Partial<InsightsSegmentCountsRow>,
): InsightsSegmentCountsRow => ({
  dimension: 'total',
  key: 'all',
  population: 0,
  noPlay: 0,
  noPlayBase: 0,
  noComplete: 0,
  noCompleteBase: 0,
  lapsing: 0,
  lapsingBase: 0,
  ...over,
});

describe('서비스 지표 v2 순수 계산', () => {
  it('daysElapsedInWeek — 월요일은 1, 일요일은 7, 주 밖이면 7 이다', () => {
    expect(daysElapsedInWeek('2026-10-26', '2026-10-26')).toBe(1);
    expect(daysElapsedInWeek('2026-10-26', '2026-10-28')).toBe(3);
    expect(daysElapsedInWeek('2026-10-26', '2026-11-01')).toBe(7);
    expect(daysElapsedInWeek('2026-10-19', '2026-10-28')).toBe(7);
  });

  it('buildNorthStar — 청취 없는 주는 0, 마지막 주만 partial, 지난주 같은 시점은 soFar 값이다', () => {
    const ns = buildNorthStar(
      [
        {
          weekStart: '2026-10-19',
          listeners: 50,
          habitUsers: 20,
          listenersSoFar: 30,
          habitSoFar: 5,
        },
        {
          weekStart: '2026-10-26',
          listeners: 25,
          habitUsers: 4,
          listenersSoFar: 25,
          habitSoFar: 4,
        },
      ],
      ['2026-10-12', '2026-10-19', '2026-10-26'],
      3,
      3,
    );
    expect(ns.weeks).toEqual([
      { weekStart: '2026-10-12', listeners: 0, habitUsers: 0, partial: false },
      {
        weekStart: '2026-10-19',
        listeners: 50,
        habitUsers: 20,
        partial: false,
      },
      { weekStart: '2026-10-26', listeners: 25, habitUsers: 4, partial: true },
    ]);
    expect(ns.lastWeekSamePoint).toEqual({
      weekStart: '2026-10-19',
      listeners: 30,
      habitUsers: 5,
    });
    expect(ns.currentWeekStart).toBe('2026-10-26');
  });

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

  describe('buildSegments — 1주 전 비교와 분해 칸 강조', () => {
    const now = [
      segRow({
        population: 200,
        noPlay: 40,
        noPlayBase: 190,
        noComplete: 30,
        noCompleteBase: 150,
        lapsing: 10,
        lapsingBase: 60,
      }),
      // 알림 권한 없음: 전체의 50% 인데 재생 0 의 80%(+30%p) → 강조
      segRow({ dimension: 'push', key: 'no', population: 100, noPlay: 32 }),
      segRow({ dimension: 'push', key: 'yes', population: 100, noPlay: 8 }),
      // 차이는 크지만 칸이 작다(4명) → 강조하지 않는다
      segRow({
        dimension: 'provider',
        key: 'apple',
        population: 2,
        noPlay: 4,
      }),
    ];
    const weekAgo = [
      segRow({ population: 180, noPlay: 35, noPlayBase: 170, lapsing: 12 }),
    ];

    it('세그먼트마다 지금·분모·1주 전 값을 싣는다', () => {
      const { population, items } = buildSegments(now, weekAgo);
      expect(population).toBe(200);
      expect(items.map((i) => i.key)).toEqual([
        'no_play',
        'no_complete',
        'lapsing',
      ]);
      expect(items[0]).toMatchObject({
        count: 40,
        base: 190,
        weekAgo: { count: 35, base: 170 },
      });
      expect(items[2].weekAgo.count).toBe(12);
    });

    it('세그먼트 안 비율과 전체 비율 차이가 15%p 이상이고 5명 이상인 칸만 notable 이다', () => {
      const noPlay = buildSegments(now, weekAgo).items[0];
      const pushNo = noPlay.breakdown.find(
        (b) => b.dimension === 'push' && b.key === 'no',
      )!;
      expect(pushNo.share).toBeCloseTo(0.8);
      expect(pushNo.populationShare).toBeCloseTo(0.5);
      expect(pushNo.gap).toBeCloseTo(0.3);
      expect(pushNo.notable).toBe(true);
      const pushYes = noPlay.breakdown.find(
        (b) => b.dimension === 'push' && b.key === 'yes',
      )!;
      expect(pushYes.notable).toBe(true); // -30%p 도 강조(덜 몰린 쪽)
      const apple = noPlay.breakdown.find((b) => b.key === 'apple')!;
      expect(apple.notable).toBe(false);
    });

    it('세그먼트가 0명이면 비율이 null 이고 강조하지 않는다', () => {
      const lapsing = buildSegments(
        [
          segRow({ population: 10 }),
          segRow({ dimension: 'push', key: 'no', population: 5 }),
        ],
        [],
      ).items[2];
      expect(lapsing.breakdown[0]).toMatchObject({
        share: null,
        gap: null,
        notable: false,
      });
      expect(lapsing.weekAgo).toEqual({ count: 0, base: 0 });
    });
  });
});

describe('AdminInsightsService.insightsV2 — 창 계산', () => {
  it('서비스 주로 weeks 개(이번 주 포함)를 만들고, 묶음 경계를 서비스 날짜 시작 시각으로 넘기며, 세그먼트는 지금·7일 전 두 번 센다', async () => {
    // given — 2026-10-28(수) KST 12:00. 05:00 전환 env 가 없으면 04:00 경계
    const now = new Date('2026-10-28T03:00:00.000Z');
    const repository = {
      northStarWeeks: jest.fn().mockResolvedValue([]),
      funnelCohorts: jest.fn().mockResolvedValue([]),
      activeDatesFirstRecordedAt: jest.fn().mockResolvedValue(null),
      segmentCounts: jest.fn().mockResolvedValue([]),
    };
    const service = new AdminInsightsService(repository as never);

    // when — 범위 밖 주 수는 4~12 로 자른다
    const v2 = await service.insightsV2(100, now, UserMarket.KR);

    // then
    expect(v2.weeks).toBe(12);
    expect(v2.northStar.currentWeekStart).toBe('2026-10-26');
    expect(v2.northStar.daysElapsed).toBe(3);
    expect(v2.northStar.weeks).toHaveLength(12);
    expect(v2.northStar.weeks[0].weekStart).toBe('2026-08-10');
    expect(repository.northStarWeeks).toHaveBeenCalledWith(
      '2026-08-10',
      3,
      NORTH_STAR_MIN_PLAY_DAYS,
      UserMarket.KR,
    );
    const [ranges] = repository.funnelCohorts.mock.calls[0] as [
      { weekStart: string; startAt: Date; endAt: Date }[],
    ];
    expect(ranges[0].weekStart).toBe('2026-10-26');
    expect(ranges[0].endAt.getTime()).toBe(
      serviceDateStart('2026-11-02').getTime(),
    );
    expect(ranges[0].startAt.getTime()).toBe(
      serviceDateStart('2026-10-26').getTime(),
    );
    // 이번 주 묶음은 진행 중 · 빈 묶음도 0 으로 행이 있다
    expect(v2.funnel.cohorts).toHaveLength(12);
    expect(v2.funnel.cohorts[0]).toMatchObject({
      inProgress: true,
      signups: 0,
      firstPlay24h: null,
      w1Return: null,
      habit14d: null,
    });
    expect(repository.segmentCounts).toHaveBeenNthCalledWith(
      1,
      now,
      expect.any(Object),
      UserMarket.KR,
    );
    expect(
      (repository.segmentCounts.mock.calls[1] as [Date])[0].getTime(),
    ).toBe(now.getTime() - 7 * 86_400_000);
  });
});
