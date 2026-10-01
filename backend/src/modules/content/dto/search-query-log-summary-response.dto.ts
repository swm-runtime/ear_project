import { SearchQueryLogSummary } from '../content.types';

interface RankItem {
  query: string;
  searches: number;
  misses: number;
  clicked: number;
  last_searched_at: string;
}

/** `GET /admin/search-query-logs/summary` (admin-api.md 4.21) */
export class SearchQueryLogSummaryResponseDto {
  readonly days: number;
  readonly since: string;
  readonly totals: {
    searches: number;
    misses: number;
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
  readonly missed: RankItem[];
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
      last_searched_at: rank.lastSearchedAt.toISOString(),
    });

    const { searches, misses, clicked } = summary.totals;

    return {
      days,
      since: summary.since.toISOString(),
      totals: {
        searches,
        misses,
        miss_rate: searches > 0 ? misses / searches : null,
        clicked,
        users: summary.totals.users,
        short_queries: summary.totals.shortQueries,
        filtered_searches: summary.totals.filteredSearches,
      },
      daily: summary.daily,
      missed: summary.missed.map(toItem),
      top: summary.top.map(toItem),
    };
  }
}
