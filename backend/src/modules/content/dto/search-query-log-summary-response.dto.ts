import { SearchQueryLogSummary } from '../content.types';

interface RankItem {
  query: string;
  searches: number;
  misses: number;
  clicked: number;
  /** 가장 최근 검색이 첫 페이지에 돌려준 콘텐츠 수 */
  result_count: number;
  /** 가장 최근 검색에서 다음 페이지가 있었는가 — true면 `result_count`건 이상이다 */
  has_more: boolean;
  last_searched_at: string;
}

/**
 * 0건 질의 줄 — 유사 결과 폴백(KAN-238)의 마지막 건수를 더한다. `null`이면 그 질의의 마지막 검색에서 폴백이 돌지 않았고,
 * `0`이면 폴백도 못 살렸다(방안 B — 의미 검색 판단 근거)
 */
interface MissedRankItem extends RankItem {
  similar_count: number | null;
}

/** `GET /admin/search-query-logs/summary` (admin-api.md 4.21) */
export class SearchQueryLogSummaryResponseDto {
  readonly days: number;
  readonly since: string;
  readonly totals: {
    searches: number;
    misses: number;
    /** `misses` 중 유사 결과 폴백이 1건 이상 채운 검색 수 */
    rescued: number;
    /** `misses / searches`. 검색 0건이면 null */
    miss_rate: number | null;
    /**
     * 결과에 반응한 검색(10분 안 재생·담기). **비율로 만들지 않는다** — 반응 없음은 재생 한도에 막힌 건지
     * 보고 나간 건지 알 수 없어, 질의별로 "눌린 적 있나"만 본다
     */
    clicked: number;
    users: number;
    short_queries: number;
    filtered_searches: number;
  };
  readonly daily: {
    date: string;
    searches: number;
    misses: number;
    clicked: number;
  }[];
  readonly missed: MissedRankItem[];
  readonly top: RankItem[];

  static from(
    summary: SearchQueryLogSummary,
    days: number,
  ): SearchQueryLogSummaryResponseDto {
    const toItem = (rank: SearchQueryLogSummary['top'][number]): RankItem => ({
      query: rank.query,
      searches: rank.searches,
      misses: rank.misses,
      clicked: rank.clicked,
      result_count: rank.lastResultCount,
      has_more: rank.lastHasNext,
      last_searched_at: rank.lastSearchedAt.toISOString(),
    });

    const { searches, misses, clicked } = summary.totals;

    return {
      days,
      since: summary.since.toISOString(),
      totals: {
        searches,
        misses,
        rescued: summary.totals.rescued,
        miss_rate: searches > 0 ? misses / searches : null,
        clicked,
        users: summary.totals.users,
        short_queries: summary.totals.shortQueries,
        filtered_searches: summary.totals.filteredSearches,
      },
      daily: summary.daily,
      missed: summary.missed.map((rank) => ({
        ...toItem(rank),
        similar_count: rank.lastSimilarCount,
      })),
      top: summary.top.map(toItem),
    };
  }
}
