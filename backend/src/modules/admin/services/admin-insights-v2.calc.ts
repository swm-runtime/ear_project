import {
  shiftServiceDate as addDays,
  toWeekDates,
} from '@/common/utils/service-date.util';

import {
  INSIGHTS_V2_NOTABLE_GAP,
  INSIGHTS_V2_NOTABLE_MIN_COUNT,
} from '../admin.constant';
import {
  InsightsBreakdownDimension,
  InsightsFunnelCohort,
  InsightsFunnelCohortCounts,
  InsightsFunnelStep,
  InsightsFunnelStepKey,
  InsightsNorthStar,
  InsightsNorthStarWeekRow,
  InsightsSegment,
  InsightsSegmentCountsRow,
  InsightsSegmentKey,
  InsightsSegments,
} from '../admin.types';

/**
 * 서비스 지표 v2(`GET /admin/insights/v2`)의 순수 계산 — 성숙 판정·가장 큰 이탈 단계·세그먼트 강조. 집계는 Repository 가,
 * 창 계산·호출 순서는 `AdminInsightsService.insightsV2`가 한다.
 */

/** 이번 주 안에서 오늘이 몇째 서비스 날짜인가(월 = 1 … 일 = 7). 주 밖이면 7 로 둔다(지난 주는 다 지났다) */
export function daysElapsedInWeek(weekStart: string, today: string): number {
  const index = toWeekDates(weekStart).indexOf(today);
  return index < 0 ? 7 : index + 1;
}

/**
 * North Star 주간 계열 — `weekStarts`(오래된 주 먼저)마다 한 칸, 청취가 없던 주는 0. 마지막 주(이번 주)는 `partial`.
 * 지난주 같은 시점 값은 Repository 가 센 `soFar`(각 주의 첫 `daysElapsed`일) 칸을 쓴다.
 */
export function buildNorthStar(
  rows: readonly InsightsNorthStarWeekRow[],
  weekStarts: readonly string[],
  daysElapsed: number,
  minPlayDays: number,
): InsightsNorthStar {
  const byWeek = new Map(rows.map((r) => [r.weekStart, r]));
  const current = weekStarts[weekStarts.length - 1];
  const lastWeek = weekStarts[weekStarts.length - 2];
  const last = byWeek.get(lastWeek);

  return {
    minPlayDays,
    currentWeekStart: current,
    daysElapsed,
    weeks: weekStarts.map((weekStart) => ({
      weekStart,
      listeners: byWeek.get(weekStart)?.listeners ?? 0,
      habitUsers: byWeek.get(weekStart)?.habitUsers ?? 0,
      partial: weekStart === current,
    })),
    lastWeekSamePoint: {
      weekStart: lastWeek,
      listeners: last?.listenersSoFar ?? 0,
      habitUsers: last?.habitSoFar ?? 0,
    },
  };
}

/**
 * 묶음 하나의 퍼널 행 — 아직 끝나지 않은 단계는 `null`로 가린다. 기준은 **묶음의 마지막 가입자**다(일부만 끝난 묶음의 값을
 * 섞으면 최근 묶음이 낮아 보인다 — 코호트 리텐션 표와 같은 규칙).
 *
 * - 첫 재생 24h: `endAt + 24h <= now`
 * - W1 복귀: 마지막 가입자의 KST 가입일은 늦어도 `weekStart + 7`(월요일 00~05시 가입은 지난 서비스 주다) → 그 +13일이 오늘 전
 *   (`weekStart + 20 < todayKst`). `weekStart + 7`(첫 가입자의 W1 첫날)이 `reliableSince` 앞이면 `w1Partial`.
 * - 첫 14일 습관: `endAt + 14일 <= now`
 */
export function buildFunnelCohort(
  counts: InsightsFunnelCohortCounts,
  endAt: Date,
  now: Date,
  todayKst: string,
  reliableSince: string,
  windows: { firstPlayHours: number; habitDays: number },
): InsightsFunnelCohort {
  const end = endAt.getTime();
  const at = now.getTime();
  const firstPlayDone = end + windows.firstPlayHours * 3_600_000 <= at;
  const habitDone = end + windows.habitDays * 86_400_000 <= at;
  const w1Done = addDays(counts.weekStart, 20) < todayKst;

  return {
    weekStart: counts.weekStart,
    inProgress: end > at,
    signups: counts.signups,
    onboardingCompleted: counts.onboardingCompleted,
    firstPlay24h: firstPlayDone ? counts.firstPlay24h : null,
    firstPlayEver: counts.firstPlayEver,
    firstComplete: counts.firstComplete,
    w1Return: w1Done ? counts.w1Return : null,
    w1Partial: addDays(counts.weekStart, 7) < reliableSince,
    habit14d: habitDone ? counts.habit14d : null,
    paidEver: counts.paidEver,
  };
}

/** 퍼널 순서 — 이 배열 순서가 곧 "앞 단계"다 */
export const FUNNEL_STEP_KEYS: readonly InsightsFunnelStepKey[] = [
  'signups',
  'onboarding_completed',
  'first_play_24h',
  'first_complete',
  'w1_return',
  'habit_14d',
  'paid_ever',
];

/** 단계 값 — 끝나지 않았거나(null) 판정을 믿을 수 없는(W1 partial) 칸은 null */
export function funnelStepValue(
  cohort: InsightsFunnelCohort,
  key: InsightsFunnelStepKey,
): number | null {
  switch (key) {
    case 'signups':
      return cohort.signups;
    case 'onboarding_completed':
      return cohort.onboardingCompleted;
    case 'first_play_24h':
      return cohort.firstPlay24h;
    case 'first_complete':
      return cohort.firstComplete;
    case 'w1_return':
      return cohort.w1Partial ? null : cohort.w1Return;
    case 'habit_14d':
      return cohort.habit14d;
    case 'paid_ever':
      return cohort.paidEver;
  }
}

/**
 * 단계별 전환율 — **성숙한 묶음만 합쳐서**(`Σ 이 단계 / Σ 앞 단계`) 낸다. 묶음이 수십 명이라 묶음별 비율의 평균은 작은 묶음에
 * 흔들린다. 성숙 = 진행 중인 가입 주가 아니고, 이 단계와 앞 단계가 둘 다 판정됐고(null 아님), 앞 단계가 1명 이상.
 * 단계는 엄밀히 포함 관계가 아니라(첫 24시간에 안 듣고 나중에 완청할 수 있다) 비율이 1 을 넘을 수 있다 — 이탈은 0 아래로 내리지 않는다.
 * 가장 큰 이탈 = `drop`이 가장 큰 단계(같으면 앞 단계).
 */
export function summarizeFunnelSteps(
  cohorts: readonly InsightsFunnelCohort[],
): {
  steps: InsightsFunnelStep[];
  largestDropStep: InsightsFunnelStepKey | null;
} {
  const steps: InsightsFunnelStep[] = FUNNEL_STEP_KEYS.map((key, i) => {
    if (i === 0) {
      return {
        key,
        matureCohorts: cohorts.filter((c) => !c.inProgress).length,
        rate: null,
        drop: null,
      };
    }
    const prevKey = FUNNEL_STEP_KEYS[i - 1];
    let cur = 0;
    let prev = 0;
    let mature = 0;
    for (const c of cohorts) {
      if (c.inProgress) continue;
      const value = funnelStepValue(c, key);
      const prevValue = funnelStepValue(c, prevKey);
      if (value === null || prevValue === null || prevValue <= 0) continue;
      cur += value;
      prev += prevValue;
      mature += 1;
    }
    const rate = prev > 0 ? cur / prev : null;
    return {
      key,
      matureCohorts: mature,
      rate,
      drop: rate === null ? null : Math.max(0, 1 - rate),
    };
  });

  let largest: InsightsFunnelStep | null = null;
  for (const step of steps) {
    if (step.drop === null) continue;
    if (largest === null || (largest.drop ?? 0) < step.drop) largest = step;
  }
  return { steps, largestDropStep: largest?.key ?? null };
}

const SEGMENT_FIELDS: Record<
  InsightsSegmentKey,
  {
    count: 'noPlay' | 'noComplete' | 'lapsing';
    base: 'noPlayBase' | 'noCompleteBase' | 'lapsingBase';
  }
> = {
  no_play: { count: 'noPlay', base: 'noPlayBase' },
  no_complete: { count: 'noComplete', base: 'noCompleteBase' },
  lapsing: { count: 'lapsing', base: 'lapsingBase' },
};

const share = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;

/**
 * 세그먼트 셋 — 지금 행(`now`)의 전체·분해 칸과 1주 전 행(`weekAgo`)의 전체 칸. 분해 칸은 세그먼트 안 비율과 전체 현재 계정 안
 * 비율을 함께 싣고, 그 차이가 `INSIGHTS_V2_NOTABLE_GAP` 이상이고 칸에 `INSIGHTS_V2_NOTABLE_MIN_COUNT`명 이상이면 `notable`이다
 * ("알림 권한 없음 비율이 전체보다 +20%p" — 원인 후보를 가리킨다).
 */
export function buildSegments(
  now: readonly InsightsSegmentCountsRow[],
  weekAgo: readonly InsightsSegmentCountsRow[],
): InsightsSegments {
  const empty: InsightsSegmentCountsRow = {
    dimension: 'total',
    key: 'all',
    population: 0,
    noPlay: 0,
    noPlayBase: 0,
    noComplete: 0,
    noCompleteBase: 0,
    lapsing: 0,
    lapsingBase: 0,
  };
  const total = now.find((r) => r.dimension === 'total') ?? empty;
  const before = weekAgo.find((r) => r.dimension === 'total') ?? empty;
  const cells = now.filter(
    (
      r,
    ): r is InsightsSegmentCountsRow & {
      dimension: InsightsBreakdownDimension;
    } => r.dimension !== 'total',
  );

  const items: InsightsSegment[] = (
    Object.keys(SEGMENT_FIELDS) as InsightsSegmentKey[]
  ).map((key) => {
    const f = SEGMENT_FIELDS[key];
    const segmentTotal = total[f.count];
    return {
      key,
      count: segmentTotal,
      base: total[f.base],
      weekAgo: { count: before[f.count], base: before[f.base] },
      breakdown: cells.map((cell) => {
        const s = share(cell[f.count], segmentTotal);
        const p = share(cell.population, total.population);
        const gap = s !== null && p !== null ? s - p : null;
        return {
          dimension: cell.dimension,
          key: cell.key,
          count: cell[f.count],
          population: cell.population,
          share: s,
          populationShare: p,
          gap,
          notable:
            gap !== null &&
            Math.abs(gap) >= INSIGHTS_V2_NOTABLE_GAP &&
            cell[f.count] >= INSIGHTS_V2_NOTABLE_MIN_COUNT,
        };
      }),
    };
  });

  return { population: total.population, items };
}
