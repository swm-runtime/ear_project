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
  | 'userId'
  | 'query'
  | 'resultCount'
  | 'hasNext'
  | 'topicFilterCount'
  | 'resultContentIds'
>;

interface TotalsRow {
  searches: number;
  misses: number;
  clicked: number;
  users: number;
  short_queries: number;
  filtered_searches: number;
}

interface DailyRow {
  date: string;
  searches: number;
  misses: number;
  clicked: number;
}

interface RankRow {
  query: string;
  searches: number;
  misses: number;
  clicked: number;
  last_result_count: number;
  last_has_next: boolean;
  last_searched_at: Date;
}

/** 어드민 요약의 질의 순위 길이 — 화면 한 표에 보이는 만큼 */
const RANK_LIMIT = 50;
/** 결과 반응으로 인정하는 창 — 마지막 질의 뒤 이 안의 재생·담기(domain.md 5.7). SQL interval 리터럴 */
const CLICK_WINDOW = '10 minutes';

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
   * 네 질의가 같은 임시 뷰(`scoped`)를 공유한다 — 창 안의 행에 **반응 여부**(`clicked`)를 붙인 것이다.
   * 반응 = 그 행의 마지막 요청(`updated_at`) 뒤 `CLICK_WINDOW` 안에 같은 사용자가 첫 페이지 결과
   * (`result_content_ids`) 중 하나를 재생(`play_records`)했거나 담았다(`library_items.source = save`,
   * 삭제분 포함 — 담은 사실이 반응이다). 앱이 탭을 보내지 않아도 서버가 이미 받는 행동에서 역산한다.
   * 전부 `created_at` 인덱스 범위 스캔 + 결과 id 배열 대조라 비용은 창 안 행 수에 비례한다(보존 90일).
   *
   * 질의 순위의 `last_result_count`·`last_has_next`는 **그 질의의 가장 최근 검색**이 돌려준 값이다 —
   * 평균을 내지 않는다(콘텐츠가 늘면 같은 질의의 결과 수가 달라지고, 운영자가 보려는 것은 "지금 치면
   * 몇 건이 나오는가"다). 첫 페이지 건수라 페이지 크기에서 멈춘다 — 그 너머는 `has_next`가 알린다.
   *
   * 일별 날짜는 **KST 달력일**이다(04시 서비스 날짜 경계를 적용하지 않는다 — 운영자가 "어제 검색"으로
   * 읽는 단위이고, 재생 한도·드립과 달리 정책 판정이 아니다).
   */
  async summarize(
    since: Date,
    manager?: EntityManager,
  ): Promise<SearchQueryLogSummary> {
    const query = this.scoped(manager).manager;
    const scoped = `
      select l.*,
             (exists (
                select 1 from play_records p
                 where p.user_id = l.user_id
                   and p.content_id = any (l.result_content_ids)
                   and p.played_at >= l.updated_at
                   and p.played_at < l.updated_at + interval '${CLICK_WINDOW}'
              ) or exists (
                select 1 from library_items i
                 where i.user_id = l.user_id
                   and i.content_id = any (l.result_content_ids)
                   and i.source = 'save'
                   and i.added_at >= l.updated_at
                   and i.added_at < l.updated_at + interval '${CLICK_WINDOW}'
              )) as clicked
        from search_query_logs l
       where l.created_at >= $1`;

    const [totals] = await query.query<TotalsRow[]>(
      `with scoped as (${scoped})
       select count(*)::int as searches,
              count(*) filter (where result_count = 0)::int as misses,
              count(*) filter (where clicked)::int as clicked,
              count(distinct user_id)::int as users,
              count(*) filter (where char_length(query) < 3)::int as short_queries,
              count(*) filter (where topic_filter_count > 0)::int as filtered_searches
         from scoped`,
      [since],
    );

    const daily = await query.query<DailyRow[]>(
      `with scoped as (${scoped})
       select to_char((created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as date,
              count(*)::int as searches,
              count(*) filter (where result_count = 0)::int as misses,
              count(*) filter (where clicked)::int as clicked
         from scoped
        group by 1
        order by 1`,
      [since],
    );

    const rank = `select query,
              count(*)::int as searches,
              count(*) filter (where result_count = 0)::int as misses,
              count(*) filter (where clicked)::int as clicked,
              (array_agg(result_count order by updated_at desc, id desc))[1]::int as last_result_count,
              (array_agg(has_next order by updated_at desc, id desc))[1] as last_has_next,
              max(updated_at) as last_searched_at
         from scoped
        group by query`;

    const missed = await query.query<RankRow[]>(
      `with scoped as (${scoped})
       ${rank}
       having count(*) filter (where result_count = 0) > 0
        order by misses desc, searches desc, last_searched_at desc
        limit $2`,
      [since, RANK_LIMIT],
    );

    const top = await query.query<RankRow[]>(
      `with scoped as (${scoped})
       ${rank}
        order by searches desc, last_searched_at desc
        limit $2`,
      [since, RANK_LIMIT],
    );

    const toRank = (row: RankRow): SearchQueryRank => ({
      query: row.query,
      searches: row.searches,
      misses: row.misses,
      clicked: row.clicked,
      lastResultCount: row.last_result_count,
      lastHasNext: row.last_has_next,
      lastSearchedAt: row.last_searched_at,
    });
    const toDaily = (row: DailyRow): SearchQueryDailyCount => ({
      date: row.date,
      searches: row.searches,
      misses: row.misses,
      clicked: row.clicked,
    });

    return {
      since,
      totals: {
        searches: totals?.searches ?? 0,
        misses: totals?.misses ?? 0,
        clicked: totals?.clicked ?? 0,
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
