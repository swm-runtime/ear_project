/**
 * GA4 응답 → 숫자. **파싱만 하는 순수 함수**라 자격 없이 검증된다.
 * 네트워크 호출은 `ga4.service.ts` 가 하고, 거기서 받은 행을 여기로 넘긴다.
 */

/** 응답 행의 최소 모양 — SDK 타입은 전부 optional·nullable 이라 그대로 쓰면 읽기 어렵다 */
export type ReportRow = {
  dimensionValues?: ({ value?: string | null } | null)[] | null;
  metricValues?: ({ value?: string | null } | null)[] | null;
};

const num = (v: string | null | undefined): number => {
  const parsed = Number(v ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};
const dim = (row: ReportRow, i: number): string =>
  row.dimensionValues?.[i]?.value ?? '';
const met = (row: ReportRow, i: number): number =>
  num(row.metricValues?.[i]?.value);

/**
 * 날짜 범위가 여럿인 리포트 — GA4 가 `dateRange` 차원을 자동으로 붙이고 값은 요청 때 준
 * 이름이다. **행 순서는 보장되지 않으므로 이름으로 찾는다.** 없는 범위는 전부 0 이다.
 * 지표 순서는 요청과 같다: activeUsers · newUsers · sessions · averageSessionDuration.
 */
export function parseRanges(
  rows: ReportRow[] | null | undefined,
  names: string[],
): Record<
  string,
  {
    activeUsers: number;
    newUsers: number;
    sessions: number;
    avgSessionSec: number;
  }
> {
  const out: Record<
    string,
    {
      activeUsers: number;
      newUsers: number;
      sessions: number;
      avgSessionSec: number;
    }
  > = {};
  for (const name of names) {
    const row = (rows ?? []).find((r) => dim(r, 0) === name);
    out[name] = row
      ? {
          activeUsers: met(row, 0),
          newUsers: met(row, 1),
          sessions: met(row, 2),
          avgSessionSec: met(row, 3),
        }
      : { activeUsers: 0, newUsers: 0, sessions: 0, avgSessionSec: 0 };
  }
  return out;
}

/** 이벤트별 [건수, 사용자 수] — `eventName` 차원 하나, 지표 순서 eventCount · activeUsers. 없으면 0 */
export function parseEventStats(
  rows: ReportRow[] | null | undefined,
): Record<string, { count: number; users: number }> {
  const out: Record<string, { count: number; users: number }> = {};
  for (const r of rows ?? [])
    out[dim(r, 0)] = { count: met(r, 0), users: met(r, 1) };
  return out;
}

/**
 * 코호트 리포트 → D1·D7 리텐션.
 *
 * 차원은 `[cohort, cohortNthDay]`, 지표는 `[cohortActiveUsers, cohortTotalUsers]` 순서다.
 * `cohortNthDay` 는 `0000`·`0001` 처럼 0 을 채운 문자열로 온다 — 숫자로 바꿔 비교한다.
 *
 * **분모는 0일차(`0000`) 행에서 읽는다.** `cohortTotalUsers` 는 코호트 크기라 어느 행이든 같지만,
 * GA4 는 **값이 0 인 행을 아예 주지 않는다** — 1명 코호트에서 아무도 안 돌아온 날은 `0001` 행이
 * 없다(2026-09-29 실데이터 확인). N일차 행만 찾으면 그 날이 "모른다"로 가려지는데 진실은 **0%** 다.
 * 그래서 N일차 행이 없으면 복귀 0명으로 세고, 0일차 행조차 없을 때(코호트 자체가 빈 날)만 `null`
 * 이다 — 0% 와 "표본 없음"은 다른 사실이다. `size` 는 그 구분을 문구에서 보여 주기 위한 값이다.
 */
export function parseRetention(
  rows: ReportRow[] | null | undefined,
  cohorts: { name: string; nthDay: number }[],
): Record<string, { rate: number | null; size: number }> {
  const out: Record<string, { rate: number | null; size: number }> = {};
  for (const { name, nthDay } of cohorts) {
    const ofCohort = (rows ?? []).filter((r) => dim(r, 0) === name);
    const day0 = ofCohort.find((r) => num(dim(r, 1)) === 0);
    const size = day0 ? met(day0, 1) : 0;
    if (size <= 0) {
      out[name] = { rate: null, size: 0 };
      continue;
    }
    const dayN = ofCohort.find((r) => num(dim(r, 1)) === nthDay);
    out[name] = { rate: (dayN ? met(dayN, 0) : 0) / size, size };
  }
  return out;
}
