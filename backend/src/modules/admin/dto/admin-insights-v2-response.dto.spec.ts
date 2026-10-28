import { InsightsV2 } from '../admin.types';
import { AdminInsightsV2ResponseDto } from './admin-insights-v2-response.dto';

const v2 = (): InsightsV2 => ({
  market: null,
  weeks: 4,
  generatedAt: new Date('2026-10-28T03:00:00.000Z'),
  northStar: {
    minPlayDays: 3,
    currentWeekStart: '2026-10-26',
    daysElapsed: 3,
    weeks: [
      {
        weekStart: '2026-10-19',
        listeners: 40,
        habitUsers: 10,
        partial: false,
      },
      { weekStart: '2026-10-26', listeners: 0, habitUsers: 0, partial: true },
    ],
    lastWeekSamePoint: {
      weekStart: '2026-10-19',
      listeners: 20,
      habitUsers: 2,
    },
  },
  funnel: {
    reliableSince: '2026-09-20',
    largestDropStep: 'first_play_24h',
    steps: [{ key: 'signups', matureCohorts: 1, rate: null, drop: null }],
    cohorts: [
      {
        weekStart: '2026-10-19',
        inProgress: false,
        signups: 50,
        onboardingCompleted: 40,
        firstPlay24h: 20,
        firstPlayEver: 30,
        firstComplete: 10,
        w1Return: null,
        w1Partial: false,
        habit14d: null,
        paidEver: 1,
      },
    ],
  },
  segments: {
    population: 100,
    items: [
      {
        key: 'no_play',
        count: 30,
        base: 90,
        weekAgo: { count: 25, base: 80 },
        breakdown: [],
      },
    ],
  },
});

describe('AdminInsightsV2ResponseDto', () => {
  it('비율은 앞 단계·가입자 대비로 싣고, 끝나지 않은 단계(null)와 그 다음 단계의 앞 단계 비율은 null 이다', () => {
    const dto = AdminInsightsV2ResponseDto.from(v2(), 7);
    const rates = dto.funnel.cohorts[0].rates;
    expect(rates.onboarding_completed).toEqual({
      count: 40,
      of_prev: 0.8,
      of_signups: 0.8,
    });
    expect(rates.first_play_24h).toEqual({
      count: 20,
      of_prev: 0.5,
      of_signups: 0.4,
    });
    expect(rates.w1_return).toEqual({
      count: null,
      of_prev: null,
      of_signups: null,
    });
    // 결제는 판정됐지만 앞 단계(14일 습관)가 아직이다
    expect(rates.paid_ever).toEqual({
      count: 1,
      of_prev: null,
      of_signups: 0.02,
    });
  });

  it('North Star 습관 비율·지난주 같은 시점, 세그먼트 비율·1주 전 차이를 싣는다', () => {
    const dto = AdminInsightsV2ResponseDto.from(v2(), 7);
    expect(dto.north_star.weeks[0].habit_ratio).toBe(0.25);
    expect(dto.north_star.weeks[1].habit_ratio).toBeNull();
    expect(dto.north_star.last_week_same_point).toEqual({
      week_start: '2026-10-19',
      days: 3,
      listeners: 20,
      habit_users: 2,
      habit_ratio: 0.1,
    });
    expect(dto.segments.items[0]).toMatchObject({
      rate: 30 / 90,
      week_ago: { count: 25, base: 80, rate: 25 / 80 },
      delta: 5,
    });
    expect(dto.segments.lapse_window_days).toBe(7);
    expect(JSON.stringify(dto)).not.toMatch(/user_id|email|nickname/);
  });
});
