import { UserMarket } from '@/modules/user/user.enum';

import {
  InsightsFunnel,
  InsightsFunnelCohort,
  InsightsFunnelStepKey,
} from '../admin.types';
import {
  FUNNEL_STEP_KEYS,
  funnelStepValue,
} from '../services/admin-insights-funnel.calc';
import { ratio } from './admin-insights-summary-response.dto';

interface FunnelStepRate {
  /** 단계 값 — 끝나지 않은 단계는 null */
  count: number | null;
  /** `count / 앞 단계` — 어느 쪽이든 null 이거나 앞 단계 0 이면 null */
  of_prev: number | null;
  /** `count / signups` */
  of_signups: number | null;
}

interface FunnelCohortItem {
  week_start: string;
  in_progress: boolean;
  signups: number;
  onboarding_completed: number;
  first_play_24h: number | null;
  first_play_ever: number;
  first_complete: number;
  w1_return: number | null;
  w1_partial: boolean;
  habit_14d: number | null;
  paid_ever: number;
  /** 단계 키별 비율 — 첫 단계(`signups`)는 없다 */
  rates: Partial<Record<InsightsFunnelStepKey, FunnelStepRate>>;
}

const toCohort = (c: InsightsFunnelCohort): FunnelCohortItem => {
  const rates: FunnelCohortItem['rates'] = {};
  FUNNEL_STEP_KEYS.forEach((key, i) => {
    if (i === 0) return;
    // 비율은 표에 보이는 칸 그대로 — W1 partial 도 값은 싣는다(화면이 표시로 구분)
    const value = key === 'w1_return' ? c.w1Return : funnelStepValue(c, key);
    const prevKey = FUNNEL_STEP_KEYS[i - 1];
    const prev =
      prevKey === 'w1_return' ? c.w1Return : funnelStepValue(c, prevKey);
    rates[key] = {
      count: value,
      of_prev: value === null || prev === null ? null : ratio(value, prev),
      of_signups: value === null ? null : ratio(value, c.signups),
    };
  });
  return {
    week_start: c.weekStart,
    in_progress: c.inProgress,
    signups: c.signups,
    onboarding_completed: c.onboardingCompleted,
    first_play_24h: c.firstPlay24h,
    first_play_ever: c.firstPlayEver,
    first_complete: c.firstComplete,
    w1_return: c.w1Return,
    w1_partial: c.w1Partial,
    habit_14d: c.habit14d,
    paid_ever: c.paidEver,
    rates,
  };
};

/**
 * `GET /admin/insights/funnel` — 가입 주 코호트 퍼널(2026-10-28, 로그 콘솔 "실험 지표" 탭). 집계값뿐이다 — `user_id`·이름·이메일은 없다.
 */
export class AdminInsightsFunnelResponseDto {
  readonly weeks: number;
  readonly market: UserMarket | null;
  readonly generated_at: string;
  /** 14일 습관 단계의 기준 일수 */
  readonly habit_min_play_days: number;
  readonly reliable_since: string;
  /** 성숙한 묶음 합산 단계별 전환율 — 퍼널 순서 */
  readonly steps: {
    key: InsightsFunnelStepKey;
    mature_cohorts: number;
    rate: number | null;
    /** 같은 성숙 묶음 기준 가입자 대비 */
    rate_of_signups: number | null;
    drop: number | null;
  }[];
  readonly largest_drop_step: InsightsFunnelStepKey | null;
  /** 최근 가입 주 먼저 */
  readonly cohorts: FunnelCohortItem[];

  static from(
    f: InsightsFunnel,
    habitMinPlayDays: number,
  ): AdminInsightsFunnelResponseDto {
    return {
      weeks: f.weeks,
      market: f.market,
      generated_at: f.generatedAt.toISOString(),
      habit_min_play_days: habitMinPlayDays,
      reliable_since: f.reliableSince,
      steps: f.steps.map((s) => ({
        key: s.key,
        mature_cohorts: s.matureCohorts,
        rate: s.rate,
        rate_of_signups: s.rateOfSignups,
        drop: s.drop,
      })),
      largest_drop_step: f.largestDropStep,
      cohorts: f.cohorts.map(toCohort),
    };
  }
}
