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
    /** 결과에 반응한 검색(10분 안 재생·담기) */
    clicked: number;
    /** 결과가 있었는데 반응이 없던 검색 = `searches - misses - clicked` */
    abandoned: number;
    /** `abandoned / (searches - misses)`. 결과 있던 검색이 0건이면 null */
    abandon_rate: number | null;
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
    const withResults = searches - misses;
    const abandoned = withResults - clicked;

    return {
      days,
      since: summary.since.toISOString(),
      totals: {
        searches,
        misses,
        miss_rate: searches > 0 ? misses / searches : null,
        clicked,
        abandoned,
        abandon_rate: withResults > 0 ? abandoned / withResults : null,
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
