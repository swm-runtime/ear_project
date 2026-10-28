import { UserMarket } from '@/modules/user/user.enum';

import {
  InsightsBreakdownDimension,
  InsightsFunnelCohort,
  InsightsFunnelStepKey,
  InsightsSegmentKey,
  InsightsV2,
} from '../admin.types';
import {
  FUNNEL_STEP_KEYS,
  funnelStepValue,
} from '../services/admin-insights-v2.calc';
import { ratio } from './admin-insights-summary-response.dto';

interface NorthStarWeekItem {
  week_start: string;
  listeners: number;
  habit_users: number;
  /** `habit_users / listeners` */
  habit_ratio: number | null;
  /** 진행 중인 주 */
  partial: boolean;
}

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

interface BreakdownItem {
  dimension: InsightsBreakdownDimension;
  key: string;
  count: number;
  population: number;
  share: number | null;
  population_share: number | null;
  gap: number | null;
  notable: boolean;
}

interface SegmentItem {
  key: InsightsSegmentKey;
  count: number;
  base: number;
  /** `count / base` */
  rate: number | null;
  week_ago: { count: number; base: number; rate: number | null };
  /** `count - week_ago.count` */
  delta: number;
  breakdown: BreakdownItem[];
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
 * `GET /admin/insights/v2` — 서비스 지표 v2(2026-10-28). 질문 셋(① 습관 사용자 ② 어디서 새나 ③ 누가 안 듣나)의 집계값뿐이다.
 * `user_id`·이름·이메일은 없다.
 */
export class AdminInsightsV2ResponseDto {
  readonly weeks: number;
  readonly market: UserMarket | null;
  readonly generated_at: string;
  readonly north_star: {
    min_play_days: number;
    current_week_start: string;
    days_elapsed: number;
    /** 오래된 주 먼저, 마지막이 이번 주 */
    weeks: NorthStarWeekItem[];
    /** 지난주를 이번 주와 같은 요일까지(첫 `days_elapsed`일)만 센 값 */
    last_week_same_point: {
      week_start: string;
      days: number;
      listeners: number;
      habit_users: number;
      habit_ratio: number | null;
    };
  };
  readonly funnel: {
    reliable_since: string;
    /** 성숙한 묶음 합산 단계별 전환율 — 퍼널 순서 */
    steps: {
      key: InsightsFunnelStepKey;
      mature_cohorts: number;
      rate: number | null;
      drop: number | null;
    }[];
    largest_drop_step: InsightsFunnelStepKey | null;
    /** 최근 가입 주 먼저 */
    cohorts: FunnelCohortItem[];
  };
  readonly segments: {
    population: number;
    lapse_window_days: number;
    items: SegmentItem[];
  };

  static from(
    v: InsightsV2,
    lapseWindowDays: number,
  ): AdminInsightsV2ResponseDto {
    const ns = v.northStar;
    return {
      weeks: v.weeks,
      market: v.market,
      generated_at: v.generatedAt.toISOString(),
      north_star: {
        min_play_days: ns.minPlayDays,
        current_week_start: ns.currentWeekStart,
        days_elapsed: ns.daysElapsed,
        weeks: ns.weeks.map((w) => ({
          week_start: w.weekStart,
          listeners: w.listeners,
          habit_users: w.habitUsers,
          habit_ratio: ratio(w.habitUsers, w.listeners),
          partial: w.partial,
        })),
        last_week_same_point: {
          week_start: ns.lastWeekSamePoint.weekStart,
          days: ns.daysElapsed,
          listeners: ns.lastWeekSamePoint.listeners,
          habit_users: ns.lastWeekSamePoint.habitUsers,
          habit_ratio: ratio(
            ns.lastWeekSamePoint.habitUsers,
            ns.lastWeekSamePoint.listeners,
          ),
        },
      },
      funnel: {
        reliable_since: v.funnel.reliableSince,
        steps: v.funnel.steps.map((s) => ({
          key: s.key,
          mature_cohorts: s.matureCohorts,
          rate: s.rate,
          drop: s.drop,
        })),
        largest_drop_step: v.funnel.largestDropStep,
        cohorts: v.funnel.cohorts.map(toCohort),
      },
      segments: {
        population: v.segments.population,
        lapse_window_days: lapseWindowDays,
        items: v.segments.items.map((s) => ({
          key: s.key,
          count: s.count,
          base: s.base,
          rate: ratio(s.count, s.base),
          week_ago: {
            count: s.weekAgo.count,
            base: s.weekAgo.base,
            rate: ratio(s.weekAgo.count, s.weekAgo.base),
          },
          delta: s.count - s.weekAgo.count,
          breakdown: s.breakdown.map((b) => ({
            dimension: b.dimension,
            key: b.key,
            count: b.count,
            population: b.population,
            share: b.share,
            population_share: b.populationShare,
            gap: b.gap,
            notable: b.notable,
          })),
        })),
      },
    };
  }
}
