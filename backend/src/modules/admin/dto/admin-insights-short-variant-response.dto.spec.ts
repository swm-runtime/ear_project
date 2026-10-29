import { InsightsVariantMetrics, InsightsVariantSplit } from '../admin.types';
import { AdminInsightsShortVariantResponseDto } from './admin-insights-short-variant-response.dto';

const m = (starters: number, completers: number): InsightsVariantMetrics => ({
  starters,
  completers,
  completionRate: starters > 0 ? completers / starters : null,
  drop10: 0,
  drop30: 1,
  drop60: 1,
  rate10: starters > 0 ? 0 : null,
  rate30: starters > 0 ? 1 / starters : null,
  rate60: starters > 0 ? 1 / starters : null,
});
const split = (
  all: InsightsVariantMetrics,
  ex: InsightsVariantMetrics,
): InsightsVariantSplit => ({
  all,
  excludingFirst: ex,
});

describe('AdminInsightsShortVariantResponseDto', () => {
  it('snake_case 로 옮기고, 사용자 식별 칸 없이 집계만 싣는다', () => {
    // when
    const dto = AdminInsightsShortVariantResponseDto.from(
      {
        generatedAt: new Date('2026-10-29T00:00:00.000Z'),
        market: null,
        cohortSince: new Date('2026-10-28T00:00:00.000Z'),
        cohortWindowHours: 24,
        byCohort: [
          { key: 'standard', ...split(m(2, 1), m(1, 1)) },
          { key: 'short', ...split(m(0, 0), m(0, 0)) },
        ],
        byLengthProfile: [{ key: 'short', ...split(m(4, 2), m(2, 1)) }],
        byIntroVersion: [{ key: null, ...split(m(4, 2), m(2, 1)) }],
        pairs: [
          {
            short: {
              contentId: 's1',
              title: '짧은',
              durationSec: 420,
              introVersion: 'hook-v2',
              ...split(m(1, 1), m(0, 0)),
            },
            original: {
              contentId: 'o1',
              title: '원본',
              durationSec: 900,
              introVersion: null,
              ...split(m(2, 0), m(2, 0)),
            },
          },
        ],
      },
      { minAgeHours: 24, minSample: 20, dropSec: [10, 30, 60] },
    );

    // then
    expect(dto).toMatchObject({
      generated_at: '2026-10-29T00:00:00.000Z',
      market: null,
      min_age_hours: 24,
      min_sample: 20,
      drop_thresholds_sec: [10, 30, 60],
      cohort_since: '2026-10-28T00:00:00.000Z',
      cohort_window_hours: 24,
    });
    expect(dto.by_cohort?.[0]).toMatchObject({
      key: 'standard',
      all: {
        starters: 2,
        completers: 1,
        completion_rate: 0.5,
        drop_10s: 0,
        drop_30s: 1,
        drop_60s: 1,
        rate_10s: 0,
        rate_30s: 0.5,
        rate_60s: 0.5,
      },
    });
    expect(dto.by_cohort?.[0].excluding_first).toMatchObject({
      starters: 1,
      completion_rate: 1,
    });
    expect(dto.by_cohort?.[1].all.completion_rate).toBeNull();
    expect(dto.by_intro_version[0].key).toBeNull();
    expect(dto.pairs[0].short).toMatchObject({
      content_id: 's1',
      title: '짧은',
      duration_sec: 420,
      intro_version: 'hook-v2',
      all: { starters: 1, completion_rate: 1 },
    });
    expect(dto.pairs[0].original.excluding_first.starters).toBe(2);
    expect(JSON.stringify(dto)).not.toMatch(/user_id|email|nickname/);
  });

  it('경계가 없으면 cohort_since·cohort_window_hours·by_cohort 가 null 이다', () => {
    // when
    const dto = AdminInsightsShortVariantResponseDto.from(
      {
        generatedAt: new Date('2026-10-29T00:00:00.000Z'),
        market: null,
        cohortSince: null,
        cohortWindowHours: null,
        byCohort: null,
        byLengthProfile: [],
        byIntroVersion: [],
        pairs: [],
      },
      { minAgeHours: 24, minSample: 20, dropSec: [10, 30, 60] },
    );

    // then
    expect(dto.cohort_since).toBeNull();
    expect(dto.cohort_window_hours).toBeNull();
    expect(dto.by_cohort).toBeNull();
  });
});
