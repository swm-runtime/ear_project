import { InsightsFunnel } from '../admin.types';
import { AdminInsightsFunnelResponseDto } from './admin-insights-funnel-response.dto';

const funnel = (): InsightsFunnel => ({
  market: null,
  weeks: 4,
  generatedAt: new Date('2026-10-28T03:00:00.000Z'),
  reliableSince: '2026-09-20',
  largestDropStep: 'first_play_24h',
  steps: [
    {
      key: 'signups',
      matureCohorts: 1,
      rate: null,
      rateOfSignups: null,
      drop: null,
    },
    {
      key: 'onboarding_completed',
      matureCohorts: 1,
      rate: 0.8,
      rateOfSignups: 0.8,
      drop: 0.2,
    },
  ],
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
});

describe('AdminInsightsFunnelResponseDto', () => {
  it('비율은 앞 단계·가입자 대비로 싣고, 끝나지 않은 단계(null)와 그 다음 단계의 앞 단계 비율은 null 이다', () => {
    const dto = AdminInsightsFunnelResponseDto.from(funnel(), 3);
    const rates = dto.cohorts[0].rates;
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

  it('정의값·가장 큰 이탈 단계를 싣고, 개인 식별 정보는 없다', () => {
    const dto = AdminInsightsFunnelResponseDto.from(funnel(), 3);
    expect(dto.habit_min_play_days).toBe(3);
    expect(dto.largest_drop_step).toBe('first_play_24h');
    expect(dto.reliable_since).toBe('2026-09-20');
    expect(dto.steps[1]).toMatchObject({ rate: 0.8, rate_of_signups: 0.8 });
    expect(JSON.stringify(dto)).not.toMatch(/user_id|email|nickname/);
  });
});
