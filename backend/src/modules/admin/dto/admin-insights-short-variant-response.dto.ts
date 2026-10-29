import {
  InsightsShortVariant,
  InsightsVariantMetrics,
  InsightsVariantPairSide,
  InsightsVariantSplit,
} from '../admin.types';

/** 시작·완청·초반 이탈 한 묶음 — 비율은 시작자 0이면 null */
export interface AdminVariantMetricsDto {
  starters: number;
  completers: number;
  completion_rate: number | null;
  drop_10s: number;
  drop_30s: number;
  drop_60s: number;
  rate_10s: number | null;
  rate_30s: number | null;
  rate_60s: number | null;
}

export interface AdminVariantSplitDto {
  all: AdminVariantMetricsDto;
  /** 사용자마다 처음 시작한 편을 뺀 값 */
  excluding_first: AdminVariantMetricsDto;
}

export interface AdminVariantGroupDto<K> extends AdminVariantSplitDto {
  key: K;
}

export interface AdminVariantPairSideDto extends AdminVariantSplitDto {
  content_id: string;
  title: string;
  duration_sec: number;
  intro_version: string | null;
}

function metrics(m: InsightsVariantMetrics): AdminVariantMetricsDto {
  return {
    starters: m.starters,
    completers: m.completers,
    completion_rate: m.completionRate,
    drop_10s: m.drop10,
    drop_30s: m.drop30,
    drop_60s: m.drop60,
    rate_10s: m.rate10,
    rate_30s: m.rate30,
    rate_60s: m.rate60,
  };
}

function split(s: InsightsVariantSplit): AdminVariantSplitDto {
  return { all: metrics(s.all), excluding_first: metrics(s.excludingFirst) };
}

function side(s: InsightsVariantPairSide): AdminVariantPairSideDto {
  return {
    content_id: s.contentId,
    title: s.title,
    duration_sec: s.durationSec,
    intro_version: s.introVersion,
    ...split(s),
  };
}

/**
 * `GET /admin/insights/short-variant` — 짧은 판·도입부 실험(KAN-298 · KAN-296, 2026-10-29). 집계뿐이다 — 사용자는 수로만 들어
 * 있고 `user_id`·이름·이메일은 없다(`experiments-api.md` 4.5).
 */
export class AdminInsightsShortVariantResponseDto {
  readonly generated_at: string;
  readonly market: string | null;
  readonly min_age_hours: number;
  /** 시작자가 이보다 적은 행은 "표본 작음" */
  readonly min_sample: number;
  readonly drop_thresholds_sec: number[];
  /** `SHORT_CONTENT_COHORT_SINCE` — 비면 null(경계 미설정) */
  readonly cohort_since: string | null;
  readonly cohort_window_hours: number | null;
  readonly by_cohort: AdminVariantGroupDto<'standard' | 'short'>[] | null;
  readonly by_length_profile: AdminVariantGroupDto<string>[];
  /** key null = 기존 도입부 */
  readonly by_intro_version: AdminVariantGroupDto<string | null>[];
  readonly pairs: {
    short: AdminVariantPairSideDto;
    original: AdminVariantPairSideDto;
  }[];

  static from(
    v: InsightsShortVariant,
    options: { minAgeHours: number; minSample: number; dropSec: number[] },
  ): AdminInsightsShortVariantResponseDto {
    return {
      generated_at: v.generatedAt.toISOString(),
      market: v.market,
      min_age_hours: options.minAgeHours,
      min_sample: options.minSample,
      drop_thresholds_sec: options.dropSec,
      cohort_since: v.cohortSince?.toISOString() ?? null,
      cohort_window_hours: v.cohortWindowHours,
      by_cohort: v.byCohort?.map((g) => ({ key: g.key, ...split(g) })) ?? null,
      by_length_profile: v.byLengthProfile.map((g) => ({
        key: g.key,
        ...split(g),
      })),
      by_intro_version: v.byIntroVersion.map((g) => ({
        key: g.key,
        ...split(g),
      })),
      pairs: v.pairs.map((p) => ({
        short: side(p.short),
        original: side(p.original),
      })),
    };
  }
}
