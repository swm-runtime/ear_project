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
  /** 가장 최근 검색이 실제로 쓴 질의(교정어 또는 원문, KAN-238). 기능 전 옛 행이면 null */
  query_used: string | null;
  /** 가장 최근 검색의 첫 페이지 중 키워드로 맞은 건수. 옛 행이면 null */
  keyword_count: number | null;
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
    /** 교정된 검색(`query_used <> query` — KAN-238) */
    corrected: number;
    /** 교정 직후 10분 안 같은 입력의 원문 재검색(`exact=true`) */
    correction_rejected: number;
    /** 키워드 엔진 0건 */
    keyword_misses: number;
    /** 키워드 0건인데 결과가 있던 검색 — 의미 엔진이 살렸다 */
    rescued: number;
    /** 의미 엔진 없이 응답한 검색(AI 서버 결손·미설정, 태그 전용 제외) */
    semantic_unavailable: number;
  };
  readonly daily: {
    date: string;
    searches: number;
    misses: number;
    clicked: number;
    /** 키워드 0건인데 결과가 있던 검색(의미 엔진이 살렸다, 2026-10-27) */
    rescued: number;
  }[];
  readonly missed: RankItem[];
  readonly top: RankItem[];
  /**
   * 의미 검색만으로 결과가 나온 질의(2026-10-27) — 키워드 0건이라 결과가 전부 의미 엔진 몫이다. `query`는 실제 쓴 질의(교정어 포함).
   * `contents`는 가장 최근 검색의 첫 페이지 앞 3편과 그 주제. `clicked`는 10분 안 재생·담기(다른 표와 같은 정의)
   */
  readonly semantic: {
    query: string;
    searches: number;
    clicked: number;
    contents: { content_id: string; title: string; topics: string[] }[];
    last_searched_at: string;
  }[];
  /** 오타 교정(KAN-238) — 입력 → 교정어, `rejected` = 교정 직후 10분 안 같은 입력의 원문 재검색 */
  readonly corrections: {
    query: string;
    query_used: string;
    searches: number;
    rejected: number;
    clicked: number;
    last_searched_at: string;
  }[];

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
      query_used: rank.lastQueryUsed,
      keyword_count: rank.lastKeywordCount,
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
        corrected: summary.totals.corrected,
        correction_rejected: summary.totals.correctionRejected,
        keyword_misses: summary.totals.keywordMisses,
        rescued: summary.totals.rescued,
        semantic_unavailable: summary.totals.semanticUnavailable,
      },
      daily: summary.daily,
      missed: summary.missed.map(toItem),
      top: summary.top.map(toItem),
      semantic: summary.semantic.map((row) => ({
        query: row.query,
        searches: row.searches,
        clicked: row.clicked,
        contents: row.contents.map((content) => ({
          content_id: content.contentId,
          title: content.title,
          topics: content.topics,
        })),
        last_searched_at: row.lastSearchedAt.toISOString(),
      })),
      corrections: summary.corrections.map((row) => ({
        query: row.query,
        query_used: row.queryUsed,
        searches: row.searches,
        rejected: row.rejected,
        clicked: row.clicked,
        last_searched_at: row.lastSearchedAt.toISOString(),
      })),
    };
  }
}
