import {
  InsightsShortVariantCohort,
  InsightsShortVariantPairRow,
  InsightsShortVariantRow,
  InsightsVariantGroup,
  InsightsVariantMetrics,
  InsightsVariantPair,
  InsightsVariantPairSide,
  InsightsVariantSplit,
} from '../admin.types';

/**
 * 짧은 판·도입부 실험(`GET /admin/insights/short-variant`, KAN-298 · KAN-296)의 순수 계산 — Repository 의 (콘텐츠, 코호트,
 * 첫 편 여부) 묶음을 코호트·길이 프로필·도입부 버전·짝으로 다시 더하고 비율을 붙인다.
 */

const COHORTS: InsightsShortVariantCohort[] = ['standard', 'short'];
const LENGTH_PROFILES = ['standard', 'short'];

/** 분모가 0이면 null — 0%와 "잴 사람이 없다"를 구분한다 */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** 묶음 행을 더해 비율을 붙인다 */
export function variantMetrics(
  rows: InsightsShortVariantRow[],
): InsightsVariantMetrics {
  const sum = rows.reduce(
    (acc, r) => ({
      starters: acc.starters + r.starters,
      completers: acc.completers + r.completers,
      drop10: acc.drop10 + r.drop10,
      drop30: acc.drop30 + r.drop30,
      drop60: acc.drop60 + r.drop60,
    }),
    { starters: 0, completers: 0, drop10: 0, drop30: 0, drop60: 0 },
  );
  return {
    ...sum,
    completionRate: ratio(sum.completers, sum.starters),
    rate10: ratio(sum.drop10, sum.starters),
    rate30: ratio(sum.drop30, sum.starters),
    rate60: ratio(sum.drop60, sum.starters),
  };
}

/** 전체와 "첫 편 제외" — 사용자마다 처음 시작한 편(같은 날 시작한 다른 실험이 바꾸는 편)을 뺀 값 */
export function variantSplit(
  rows: InsightsShortVariantRow[],
): InsightsVariantSplit {
  return {
    all: variantMetrics(rows),
    excludingFirst: variantMetrics(rows.filter((r) => !r.isFirst)),
  };
}

function groupBy<K>(
  rows: InsightsShortVariantRow[],
  keys: K[],
  keyOf: (r: InsightsShortVariantRow) => unknown,
): InsightsVariantGroup<K>[] {
  return keys.map((key) => ({
    key,
    ...variantSplit(rows.filter((r) => keyOf(r) === key)),
  }));
}

/** 가입 코호트별 — 경계가 없으면 null. 창 밖 가입자(`cohort = null`)는 넣지 않는다 */
export function byCohort(
  rows: InsightsShortVariantRow[],
  hasBoundary: boolean,
): InsightsVariantGroup<InsightsShortVariantCohort>[] | null {
  return hasBoundary ? groupBy(rows, COHORTS, (r) => r.cohort) : null;
}

/** 콘텐츠 길이 프로필별 — standard·short 두 행(시작자 0이어도 나온다) */
export function byLengthProfile(
  rows: InsightsShortVariantRow[],
): InsightsVariantGroup<string>[] {
  return groupBy(rows, LENGTH_PROFILES, (r) => r.lengthProfile);
}

/** 도입부 버전별 — 기존 도입부(null)는 늘 맨 앞, 나머지는 시작 기록이 있는 버전만 이름 순 */
export function byIntroVersion(
  rows: InsightsShortVariantRow[],
): InsightsVariantGroup<string | null>[] {
  const versions = [
    ...new Set(
      rows.map((r) => r.introVersion).filter((v): v is string => v !== null),
    ),
  ].sort();
  return groupBy<string | null>(
    rows,
    [null, ...versions],
    (r) => r.introVersion,
  );
}

/** 짧은 판 ↔ 원본 짝 — 각 편의 전 사용자 값. 짧은 판 시작자 많은 순(같으면 원래 순서) */
export function variantPairs(
  rows: InsightsShortVariantRow[],
  pairs: InsightsShortVariantPairRow[],
): InsightsVariantPair[] {
  const byContent = new Map<string, InsightsShortVariantRow[]>();
  for (const row of rows) {
    const list = byContent.get(row.contentId) ?? [];
    list.push(row);
    byContent.set(row.contentId, list);
  }
  const side = (
    contentId: string,
    title: string,
    durationSec: number,
    introVersion: string | null,
  ): InsightsVariantPairSide => ({
    contentId,
    title,
    durationSec,
    introVersion,
    ...variantSplit(byContent.get(contentId) ?? []),
  });

  return pairs
    .map((p) => ({
      short: side(
        p.shortContentId,
        p.shortTitle,
        p.shortDurationSec,
        p.shortIntroVersion,
      ),
      original: side(
        p.originalContentId,
        p.originalTitle,
        p.originalDurationSec,
        p.originalIntroVersion,
      ),
    }))
    .sort((a, b) => b.short.all.starters - a.short.all.starters); // 안정 정렬 — 같으면 원래 순서
}
