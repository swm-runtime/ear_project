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
 * 총계 리포트 — 차원 없이 지표만 요청하므로 행이 하나다.
 * 행이 없으면 0 이다: GA4 는 값이 없는 날을 빈 응답으로 준다.
 */
export function parseTotals(rows: ReportRow[] | null | undefined): {
  activeUsers: number;
  newUsers: number;
} {
  const row = rows?.[0];
  return row
    ? { activeUsers: met(row, 0), newUsers: met(row, 1) }
    : { activeUsers: 0, newUsers: 0 };
}

/** 이벤트 수 리포트 — `eventName` 차원 한 개. 찾는 이벤트가 없으면 0 */
export function parseEventCount(
  rows: ReportRow[] | null | undefined,
  eventName: string,
): number {
  const row = (rows ?? []).find((r) => dim(r, 0) === eventName);
  return row ? met(row, 0) : 0;
}

/**
 * 코호트 리포트 → D1·D7 리텐션.
 *
 * 차원은 `[cohort, cohortNthDay]`, 지표는 `[cohortActiveUsers, cohortTotalUsers]` 순서다.
 * `cohortNthDay` 는 `0000`·`0001` 처럼 0 을 채운 문자열로 온다 — 숫자로 바꿔 비교한다.
 *
 * **분모가 0 이면 `null` 이다.** 0% 가 아니다 — 코호트가 비어 있는 것과 아무도 돌아오지
 * 않은 것은 다른 사실이고, 0% 로 적으면 지표를 잘못 읽는다.
 */
export function parseRetention(
  rows: ReportRow[] | null | undefined,
  cohorts: { name: string; nthDay: number }[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const { name, nthDay } of cohorts) {
    const row = (rows ?? []).find(
      (r) => dim(r, 0) === name && num(dim(r, 1)) === nthDay,
    );
    const total = row ? met(row, 1) : 0;
    out[name] = row && total > 0 ? met(row, 0) / total : null;
  }
  return out;
}
