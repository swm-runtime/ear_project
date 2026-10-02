import type { EarSearchQueryLogSummary, EarSearchQueryRank } from "./ear";

/**
 * 검색 로그 요약 응답의 정규화.
 *
 * 콘솔은 dev 머지 때, 제품 API 운영계는 main 머지 때 배포된다 — 그 사이 운영 서버는 새 필드(`clicked`·
 * `result_count`·`has_more`)가 없는 옛 응답을 준다. 화면이 없는 필드를 그대로 읽어 탭 전체가 죽었다
 * (2026-10-02 — `t.clicked.toLocaleString()`). 서버가 안 준 값은 **null("모름")**로 채우고 화면이 "-"로 적는다.
 * 0으로 채우지 않는다 — "클릭 0회"와 "아직 집계 안 함"은 다른 말이다.
 */
type Maybe<T> = { [K in keyof T]?: T[K] | null };
type RawRank = Omit<EarSearchQueryRank, "clicked" | "result_count" | "has_more"> & Maybe<Pick<EarSearchQueryRank, "clicked" | "result_count" | "has_more">>;

export type RawSearchQueryLogSummary = Omit<EarSearchQueryLogSummary, "totals" | "daily" | "missed" | "top"> & {
  totals: Omit<EarSearchQueryLogSummary["totals"], "clicked"> & { clicked?: number | null };
  daily?: (Omit<EarSearchQueryLogSummary["daily"][number], "clicked"> & { clicked?: number | null })[] | null;
  missed?: RawRank[] | null;
  top?: RawRank[] | null;
};

const toRank = (r: RawRank): EarSearchQueryRank => ({
  ...r,
  clicked: r.clicked ?? null,
  result_count: r.result_count ?? null,
  has_more: r.has_more ?? false,
});

export function normalizeSearchQueryLogSummary(raw: RawSearchQueryLogSummary): EarSearchQueryLogSummary {
  return {
    ...raw,
    totals: { ...raw.totals, clicked: raw.totals.clicked ?? null },
    // 일별 막대의 초록(클릭) 높이 계산용 — 모르는 날은 0으로 그린다(막대만 안 칠해진다)
    daily: (raw.daily ?? []).map((d) => ({ ...d, clicked: d.clicked ?? 0 })),
    missed: (raw.missed ?? []).map(toRank),
    top: (raw.top ?? []).map(toRank),
  };
}
