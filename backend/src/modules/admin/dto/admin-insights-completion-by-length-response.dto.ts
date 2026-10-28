import {
  InsightsCompletionByLength,
  InsightsCompletionTrendDirection,
} from '../admin.types';

/**
 * `GET /admin/insights/completion-by-length` — 한국 콘텐츠 길이별 완청률(2026-10-28, 로그 콘솔 "실험 지표" 탭). 편 단위 집계와
 * 추세뿐이다 — 사용자는 수로만 들어 있고 `user_id`·이름·이메일은 없다.
 */
export class AdminInsightsCompletionByLengthResponseDto {
  readonly generated_at: string;
  readonly content_market: string;
  readonly min_age_hours: number;
  /** 전체 완청률 — 축소의 기준점 */
  readonly overall_rate: number | null;
  /** 축소 강도(가상의 시작자 수) */
  readonly prior_strength: number | null;
  readonly starters: number;
  readonly completers: number;
  /** 길이 짧은 편 먼저 */
  readonly contents: {
    content_id: string;
    title: string;
    duration_sec: number;
    starters: number;
    completers: number;
    raw_rate: number;
    shrunk_rate: number;
  }[];
  readonly trend: {
    slope_step_min: number;
    odds_ratio_per_step: number;
    odds_ratio_low: number;
    odds_ratio_high: number;
    direction: InsightsCompletionTrendDirection;
    dispersion: number;
    curve: { minute: number; rate: number; low: number; high: number }[];
  } | null;

  static from(
    v: InsightsCompletionByLength,
    options: {
      contentMarket: string;
      minAgeHours: number;
      slopeStepMin: number;
    },
  ): AdminInsightsCompletionByLengthResponseDto {
    return {
      generated_at: v.generatedAt.toISOString(),
      content_market: options.contentMarket,
      min_age_hours: options.minAgeHours,
      overall_rate: v.overallRate,
      prior_strength: v.priorStrength,
      starters: v.starters,
      completers: v.completers,
      contents: v.contents.map((c) => ({
        content_id: c.contentId,
        title: c.title,
        duration_sec: c.durationSec,
        starters: c.starters,
        completers: c.completers,
        raw_rate: c.rawRate,
        shrunk_rate: c.shrunkRate,
      })),
      trend: v.trend && {
        slope_step_min: options.slopeStepMin,
        odds_ratio_per_step: v.trend.oddsRatioPerStep,
        odds_ratio_low: v.trend.oddsRatioLow,
        odds_ratio_high: v.trend.oddsRatioHigh,
        direction: v.trend.direction,
        dispersion: v.trend.dispersion,
        curve: v.trend.curve,
      },
    };
  }
}
