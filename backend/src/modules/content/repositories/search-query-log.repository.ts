import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { SearchQueryLog } from '../entities/search-query-log.entity';
import {
  SearchQueryDailyCount,
  SearchQueryLogSummary,
  SearchQueryRank,
} from '../content.types';

export type SearchQueryLogDraft = Pick<
  SearchQueryLog,
  'userId' | 'query' | 'resultCount' | 'hasNext' | 'topicFilterCount'
>;

interface TotalsRow {
  searches: number;
  misses: number;
  users: number;
  short_queries: number;
  filtered_searches: number;
}

interface DailyRow {
  date: string;
  searches: number;
  misses: number;
}

interface RankRow {
  query: string;
  searches: number;
  misses: number;
  last_searched_at: Date;
}

/** 어드민 요약의 질의 순위 길이 — 화면 한 표에 보이는 만큼 */
const RANK_LIMIT = 50;

@Injectable()
export class SearchQueryLogRepository {
  constructor(
    @InjectRepository(SearchQueryLog)
    private readonly repository: Repository<SearchQueryLog>,
  ) {}

  private scoped(manager?: EntityManager): Repository<SearchQueryLog> {
    return manager ? manager.getRepository(SearchQueryLog) : this.repository;
  }

  /** 행 하나를 더한다. 읽어서 돌려줄 일이 없어 `insert`만 한다(엔티티 재조회 없음) */
  async insert(
    draft: SearchQueryLogDraft,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).insert(draft);
  }

  /** 같은 사용자의 가장 최근 행 — 타이핑 묶음 판정용(`SearchQueryLogService`) */
  async findLatestByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<SearchQueryLog | null> {
    return this.scoped(manager).findOne({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /** 타이핑 묶음의 마지막 질의로 덮어쓴다. `created_at`은 묶음의 시작으로 남고 `updated_at`이 마지막 요청 시각이 된다 */
  async overwrite(
    id: string,
    draft: Omit<SearchQueryLogDraft, 'userId'>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update({ id }, draft);
  }

  /**
   * 어드민 요약(`admin-api.md` 4.21) — `since` 이후 행의 합계·일별 추이·질의 순위.
   *
   * Raw SQL이다(architecture.md 3.4 — Repository 안에서만, 결과를 타입으로 정의해 반환).
   * 네 질의를 따로 날린다 — 한 문장으로 묶으면 읽기 어렵고, 전부 `created_at` 인덱스 범위 스캔이라
   * 비용은 행 수에 비례할 뿐이다(90일 보존이라 상한이 있다).
   *
   * 일별 날짜는 **KST 달력일**이다(04시 서비스 날짜 경계를 적용하지 않는다 — 운영자가 "어제 검색"으로
   * 읽는 단위이고, 재생 한도·드립과 달리 정책 판정이 아니다).
   */
  async summarize(
    since: Date,
    manager?: EntityManager,
  ): Promise<SearchQueryLogSummary> {
    const query = this.scoped(manager).manager;

    const [totals] = await query.query<TotalsRow[]>(
      `select count(*)::int as searches,
              count(*) filter (where result_count = 0)::int as misses,
              count(distinct user_id)::int as users,
              count(*) filter (where char_length(query) < 3)::int as short_queries,
              count(*) filter (where topic_filter_count > 0)::int as filtered_searches
         from search_query_logs
        where created_at >= $1`,
      [since],
    );

    const daily = await query.query<DailyRow[]>(
      `select to_char((created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as date,
              count(*)::int as searches,
              count(*) filter (where result_count = 0)::int as misses
         from search_query_logs
        where created_at >= $1
        group by 1
        order by 1`,
      [since],
    );

    const missed = await query.query<RankRow[]>(
      `select query,
              count(*)::int as searches,
              count(*) filter (where result_count = 0)::int as misses,
              max(updated_at) as last_searched_at
         from search_query_logs
        where created_at >= $1
        group by query
       having count(*) filter (where result_count = 0) > 0
        order by misses desc, searches desc, last_searched_at desc
        limit $2`,
      [since, RANK_LIMIT],
    );

    const top = await query.query<RankRow[]>(
      `select query,
              count(*)::int as searches,
              count(*) filter (where result_count = 0)::int as misses,
              max(updated_at) as last_searched_at
         from search_query_logs
        where created_at >= $1
        group by query
        order by searches desc, last_searched_at desc
        limit $2`,
      [since, RANK_LIMIT],
    );

    const toRank = (row: RankRow): SearchQueryRank => ({
      query: row.query,
      searches: row.searches,
      misses: row.misses,
      lastSearchedAt: row.last_searched_at,
    });
    const toDaily = (row: DailyRow): SearchQueryDailyCount => ({
      date: row.date,
      searches: row.searches,
      misses: row.misses,
    });

    return {
      since,
      totals: {
        searches: totals?.searches ?? 0,
        misses: totals?.misses ?? 0,
        users: totals?.users ?? 0,
        shortQueries: totals?.short_queries ?? 0,
        filteredSearches: totals?.filtered_searches ?? 0,
      },
      daily: daily.map(toDaily),
      missed: missed.map(toRank),
      top: top.map(toRank),
    };
  }
}
