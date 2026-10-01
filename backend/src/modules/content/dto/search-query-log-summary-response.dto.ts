import { SearchQueryLogSummary } from '../content.types';

interface RankItem {
  query: string;
  searches: number;
  misses: number;
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
    users: number;
    short_queries: number;
    filtered_searches: number;
  };
  readonly daily: { date: string; searches: number; misses: number }[];
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
      last_searched_at: rank.lastSearchedAt.toISOString(),
    });

    return {
      days,
      since: summary.since.toISOString(),
      totals: {
        searches: summary.totals.searches,
        misses: summary.totals.misses,
        miss_rate:
          summary.totals.searches > 0
            ? summary.totals.misses / summary.totals.searches
            : null,
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
