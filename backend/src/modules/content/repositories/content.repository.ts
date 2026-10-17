import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { escapeLikePattern } from '@/common/utils/search-text.util';

import {
  CONTENT_SCOPE_CONDITION,
  contentScopeParameters,
} from '../content.visibility';
import {
  SEARCH_WEIGHT_AUTHOR,
  SEARCH_WEIGHT_DESCRIPTION,
  SEARCH_WEIGHT_TAG,
  SEARCH_WEIGHT_TITLE,
  SEARCH_WEIGHT_TOPIC,
} from '../content.constant';
import {
  ALL_TIME_PERIOD_START,
  ContentStatus,
  StatsPeriodType,
} from '../content.enum';
import {
  AdminContentPageQuery,
  ContentCandidateQuery,
  ExplorePageQuery,
  PopularPageQuery,
  RankedContent,
  RankedPopularContent,
  RankedSearchContent,
  SearchPageQuery,
} from '../content.types';
import { Content } from '../entities/content.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { UserMarket } from '@/modules/user/user.enum';

/** 커서에 담기는 랭킹 값. `content_stats` 조인 결과이지 `contents`의 컬럼이 아니다 */
const RANKING_PLAY_COUNT = 'COALESCE(stat.play_count, 0)';
const RANKING_PLAY_COUNT_ALIAS = 'ranking_play_count';
const RANKING_COMPLETE_COUNT = 'COALESCE(stat.complete_count, 0)';
const RANKING_COMPLETE_COUNT_ALIAS = 'ranking_complete_count';

interface RankingRow {
  [RANKING_PLAY_COUNT_ALIAS]: string | number;
  [RANKING_COMPLETE_COUNT_ALIAS]?: string | number;
}

/**
 * 검색 매칭 — **`pg_trgm` 기반 부분 문자열 일치다**(`explore.md` 4.5-5, ILIKE가
 * `gin_trgm_ops` 인덱스를 탄다 — domain.md 5.1). 대소문자는 ILIKE가 흡수하고,
 * NFC 정규화는 호출부(애플리케이션 계층)가 질의에 이미 적용했다.
 *
 * `author_name`이 NULL이면 `NULL ILIKE ...`도 NULL이라 CASE의 ELSE(0)로 떨어진다 —
 * 별도 가드가 필요 없다.
 */
const SEARCH_MATCH_TITLE = 'content.title ILIKE :searchPattern';
const SEARCH_MATCH_AUTHOR = 'content.author_name ILIKE :searchPattern';
const SEARCH_MATCH_DESCRIPTION = 'content.description ILIKE :searchPattern';
const SEARCH_MATCH_TOPIC = `EXISTS (
  SELECT 1 FROM content_topics matched
  JOIN topics matched_topic ON matched_topic.id = matched.topic_id
  WHERE matched.content_id = content.id
    AND matched_topic.name ILIKE :searchPattern
)`;

/**
 * 해시태그 매칭(KAN-218) — `contents.tags`(jsonb 문자열 배열)의 항목 하나라도 맞으면 된다. 태그가 NULL이면
 * `jsonb_array_elements_text`가 행을 내지 않아 EXISTS가 거짓이다.
 *
 * 저장된 태그는 정규화하지 않고 비교한다 — 적재 검증(`CONTENT_TAG_PATTERN`)이 완성형 한글·ASCII 영숫자·공백만
 * 받아 NFC가 보장되고, 그 문자 범위에서는 SQL `lower()`와 질의 쪽 `toLowerCase()`가 같다. **태그 문자 범위를
 * 넓히면 이 두 가정을 다시 본다.** 인덱스는 두지 않는다: 태그는 콘텐츠당 4개 이하이고 초기 풀이 작아 순차 탐색
 * 비용이 무시할 만하다(domain.md 5.1 — 2자 질의 순차 탐색과 같은 논리, 2026-10-16 운영 콘텐츠 71편).
 */
const SEARCH_MATCH_TAG = `EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(content.tags) AS matched_tag(tag)
  WHERE matched_tag.tag ILIKE :searchPattern
)`;

/** 태그 전용 검색(`#태그`) — 태그 항목과 **정확히 같아야** 한다(소문자 통일. 안쪽 공백은 그대로) */
const SEARCH_MATCH_TAG_EXACT = `EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(content.tags) AS matched_tag(tag)
  WHERE lower(matched_tag.tag) = :searchQuery
)`;

/**
 * 랭킹 1순위 — 매칭 필드 가중 합산(제목 > 태그 > 저자 > 주제명 > 설명). 가중치가 2의 거듭제곱이라
 * 이 합산이 곧 문서의 필드 우선순위다(`content.constant.ts` 참조).
 */
const SEARCH_SCORE = `(
  (CASE WHEN ${SEARCH_MATCH_TITLE} THEN ${SEARCH_WEIGHT_TITLE} ELSE 0 END)
  + (CASE WHEN ${SEARCH_MATCH_TAG} THEN ${SEARCH_WEIGHT_TAG} ELSE 0 END)
  + (CASE WHEN ${SEARCH_MATCH_AUTHOR} THEN ${SEARCH_WEIGHT_AUTHOR} ELSE 0 END)
  + (CASE WHEN ${SEARCH_MATCH_TOPIC} THEN ${SEARCH_WEIGHT_TOPIC} ELSE 0 END)
  + (CASE WHEN ${SEARCH_MATCH_DESCRIPTION} THEN ${SEARCH_WEIGHT_DESCRIPTION} ELSE 0 END)
)`;
const SEARCH_SCORE_ALIAS = 'search_score';

/**
 * 시리즈 제목 일치(KAN-134 확정 설계 4번 — 탐색 시리즈 카드가 켜졌을 때만). 편 제목이 아니라 그 편이 속한 시리즈의 제목이
 * 맞으면 편도 결과에 든다 — 탐색이 그 편들을 시리즈 카드 하나로 접는다. 가중은 제목과 같다(시리즈 제목은 편의 제목 계열이다)
 */
const SEARCH_MATCH_SERIES_TITLE = `EXISTS (
  SELECT 1 FROM series matched_series
  WHERE matched_series.id = content.series_id
    AND matched_series.title ILIKE :searchPattern
)`;
const SEARCH_SCORE_WITH_SERIES = `(${SEARCH_SCORE}
  + (CASE WHEN ${SEARCH_MATCH_SERIES_TITLE} THEN ${SEARCH_WEIGHT_TITLE} ELSE 0 END)
)`;

/**
 * 태그 전용 검색의 1순위 — 매칭이 곧 정확 일치라 필드 가중이 의미가 없다. 상수로 두고 동점 해소 체인
 * (제목 유사도 → 인기 → 신선도)만 쓴다. 커서 모양은 부분 일치와 같게 유지한다.
 */
// 맨 정수 리터럴은 ORDER BY에서 "선택 목록의 0번째 열"로 읽혀 오류가 난다 — 캐스트해 식으로 만든다
const TAG_ONLY_SEARCH_SCORE = '0::integer';

/**
 * 동점 해소 1키 — 제목 `word_similarity`(`explore.md` 4.5-5).
 * `real`(4바이트)을 그대로 쓰면 커서로 되돌아온 float8 파라미터와의 재비교가 어긋나므로
 * **`double precision`으로 캐스팅해 계산·정렬·커서 비교를 전부 같은 타입으로 맞춘다.**
 */
const SEARCH_TITLE_SIMILARITY =
  'word_similarity(:searchQuery, content.title)::double precision';
const SEARCH_TITLE_SIMILARITY_ALIAS = 'search_title_similarity';

interface SearchRow extends RankingRow {
  [SEARCH_SCORE_ALIAS]: string | number;
  [SEARCH_TITLE_SIMILARITY_ALIAS]: string | number;
}

@Injectable()
export class ContentRepository {
  constructor(
    @InjectRepository(Content)
    private readonly repository: Repository<Content>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Content> {
    return manager ? manager.getRepository(Content) : this.repository;
  }

  /**
   * 노출 조건 — **어디서나 `status = published` 하나로 통일한다**(domain.md 5.1).
   * 라이선스 기간이 지난 파트너 콘텐츠도 함께 걸러낸다(FR-33).
   */
  private applyVisibility(
    builder: SelectQueryBuilder<Content>,
    now: Date,
    market: UserMarket,
  ): SelectQueryBuilder<Content> {
    return builder.where(
      CONTENT_SCOPE_CONDITION,
      contentScopeParameters(now, market),
    );
  }

  /** 주제 필터는 **OR 조합**이다 — 다중 선택의 의도는 "이 중 아무거나"다 */
  private applyTopicFilter(
    builder: SelectQueryBuilder<Content>,
    topicIds: string[],
  ): void {
    builder.andWhere(
      `EXISTS (
         SELECT 1 FROM content_topics filtered
         WHERE filtered.content_id = content.id
           AND filtered.topic_id IN (:...topicIds)
       )`,
      { topicIds },
    );
  }

  async findById(id: string, manager?: EntityManager): Promise<Content | null> {
    return this.scoped(manager).findOneBy({ id });
  }

  /**
   * 재발행처럼 같은 행을 읽고 바꾸는 경로를 직렬화한다 — 트랜잭션 필수.
   * 무잠금 `findOne` 뒤 `content_version += 1`은 동시 재발행 두 건이 같은 버전을 읽어
   * 둘 다 N+1을 쓰고 서로의 새 오디오를 지우는 경합이 있었다(2026-09-09 감사).
   *
   * `FOR NO KEY UPDATE`인 이유는 `UserRepository.findByIdForUpdate`와 같다 — 재발행이 이 행을
   * 잠근 채 `playback_progresses`를 지우는 동안, 위치 저장이 같은 콘텐츠의 진행 행을 넣으며
   * FK 검사(`FOR KEY SHARE`)로 이 행을 기다리면 데드락이 된다. 같은 모드·UPDATE·DELETE와는
   * 여전히 배타적이라 동시 재발행의 직렬화는 그대로다.
   */
  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Content | null> {
    return manager.getRepository(Content).findOne({
      where: { id },
      lock: { mode: 'for_no_key_update' },
    });
  }

  /**
   * 라이선스 만료 전환(`partner-control.md` 4.4 — "만료일이 지나면 배치가 `expired`로").
   * 발행 상태이면서 만료일이 지난 행만 바꾸고 **바뀐 `content_id` 목록**을 돌려준다.
   * 회수와 달리 `withdrawn_at`은 쓰지 않는다 — 다른 사건이다.
   *
   * 여러 인스턴스가 겹쳐 돌아도 조건부 UPDATE라 안전하고, **두 번째 실행은 빈 목록을 받는다** —
   * 이미 `expired`라 조건에 걸리지 않는다. 그래서 라이브러리 삭제도 한 번만 일어난다.
   */
  async expireLicensed(now: Date, manager?: EntityManager): Promise<string[]> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .update(Content)
      .set({ status: ContentStatus.EXPIRED })
      .where('status = :published', { published: ContentStatus.PUBLISHED })
      .andWhere('license_expires_at IS NOT NULL')
      .andWhere('license_expires_at <= :now', { now })
      // 바뀐 행의 id를 받아야 라이브러리 잔존분을 지울 수 있다(4.4 — 회수와 동일 처리)
      .returning('id')
      .execute();

    return Array.isArray(result.raw)
      ? (result.raw as { id: string }[]).map((row) => row.id)
      : [];
  }

  async findAllByIds(
    ids: string[],
    manager?: EntityManager,
  ): Promise<Content[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.scoped(manager).findBy({ id: In(ids) });
  }

  /**
   * 회수 동기화(`partner-control.md` 4.3 — 클라이언트 동기화) — 그 시각 이후 회수된
   * `content_id` 목록. 별도 테이블 없이 `contents`의 상태·시각으로 판정한다(domain.md 14장).
   */
  async findWithdrawnSince(
    since: Date,
    limit: number,
    manager?: EntityManager,
  ): Promise<{ id: string; withdrawnAt: Date }[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('content')
      .select('content.id', 'id')
      .addSelect('content.withdrawn_at', 'withdrawn_at')
      .where('content.status = :status', { status: ContentStatus.WITHDRAWN })
      .andWhere('content.withdrawn_at > :since', { since })
      .orderBy('content.withdrawn_at', 'ASC')
      // 같은 시각(일괄 회수)의 순서를 고정한다 — 호출부가 시각 단위로 페이지를 자른다
      .addOrderBy('content.id', 'ASC')
      // 한 건 더 읽어 잘렸는지 판정한다 — 호출부가 잘라낸다(목록 조회의 공통 형태)
      .limit(limit + 1)
      .getRawMany<{ id: string; withdrawn_at: Date }>();

    return rows.map((row) => ({
      id: row.id,
      withdrawnAt: row.withdrawn_at,
    }));
  }

  /**
   * 추천·편성 후보를 인기·신선도 순으로 조회한다.
   *
   * 콜드스타트(FR-17) 규칙이라 전체 구간(`period_type = all`) 재생 수를 1순위,
   * `published_at`을 2순위로 쓴다. 마지막 `id` 정렬은 **동점 구간의 순서를 고정**하기
   * 위한 것이다 — 순서가 흔들리면 재진입 시 같은 9건을 보장할 수 없다
   * (onboarding-api.md 4.5).
   *
   * 정렬용 집계는 조회 안에서 조인으로 해결한다(architecture.md 3.4 — Service에서
   * 루프 조회하지 않는다).
   */
  async findCandidates(
    query: ContentCandidateQuery,
    manager?: EntityManager,
  ): Promise<Content[]> {
    const builder = this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .leftJoin(
          'content_stats',
          'stat',
          'stat.content_id = content.id AND stat.period_type = :allPeriod AND stat.period_start = :allPeriodStart',
          {
            allPeriod: StatsPeriodType.ALL,
            allPeriodStart: ALL_TIME_PERIOD_START,
          },
        ),
      query.now,
      query.market,
    );

    if (query.seriesStartOnly) {
      builder.andWhere(
        '(content.episode_no IS NULL OR content.episode_no = 1)',
      );
    }

    if (query.includeTopicIds && query.includeTopicIds.length > 0) {
      builder.andWhere(
        `EXISTS (
           SELECT 1 FROM content_topics included
           WHERE included.content_id = content.id
             AND included.topic_id IN (:...includeTopicIds)
         )`,
        { includeTopicIds: query.includeTopicIds },
      );
    }

    if (query.excludeTopicIds && query.excludeTopicIds.length > 0) {
      builder.andWhere(
        `NOT EXISTS (
           SELECT 1 FROM content_topics excluded
           WHERE excluded.content_id = content.id
             AND excluded.topic_id IN (:...excludeTopicIds)
         )`,
        { excludeTopicIds: query.excludeTopicIds },
      );
    }

    if (query.excludeContentIds && query.excludeContentIds.length > 0) {
      builder.andWhere('content.id NOT IN (:...excludeContentIds)', {
        excludeContentIds: query.excludeContentIds,
      });
    }

    if (query.excludeSeenByUserId) {
      /**
       * `domain.md` 7 후보 필터 — 이미 라이브러리에 있거나 제외 목록에 오른 콘텐츠는 뺀다.
       *
       * **`library_items`는 소프트 삭제분도 센다**(`drip-scheduling.md` 4.2 — "deleted_at 여부
       * 무관"). 원시 SQL이라 TypeORM의 `deleted_at IS NULL`이 끼어들지 않는 것이 여기서는
       * 맞는 동작이다. 지웠던 콘텐츠가 다시 적립되면 사용자에게는 되살아난 것으로 보인다.
       */
      builder.andWhere(
        `NOT EXISTS (
           SELECT 1 FROM library_items seen
           WHERE seen.content_id = content.id
             AND seen.user_id = :excludeSeenByUserId
         )`,
        { excludeSeenByUserId: query.excludeSeenByUserId },
      );
      builder.andWhere(
        `NOT EXISTS (
           SELECT 1 FROM drip_excluded_contents dripped
           WHERE dripped.content_id = content.id
             AND dripped.user_id = :excludeSeenByUserId
         )`,
        { excludeSeenByUserId: query.excludeSeenByUserId },
      );
    }

    if (query.lowExposureFirst) {
      /**
       * 탐험 슬롯 전용 정렬(`drip-scheduling.md` 4.8-2) — **덜 재생된 것부터.**
       *
       * 인기순으로 자른 풀에 저노출 가점을 주면, 카탈로그가 `limit`을 넘는 순간
       * 저노출 콘텐츠가 후보에 **들어오지도 못한다.** 자르는 기준 자체를 뒤집는다.
       */
      return builder
        .orderBy(RANKING_PLAY_COUNT, 'ASC')
        .addOrderBy('content.published_at', 'DESC')
        .addOrderBy('content.id', 'ASC')
        .limit(query.limit)
        .getMany();
    }

    return builder
      .orderBy(RANKING_PLAY_COUNT, 'DESC')
      .addOrderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'ASC')
      .limit(query.limit)
      .getMany();
  }

  /**
   * 탐색 피드의 "새로 나온 콘텐츠" 섹션(`explore.md` 4.1) — `published_at` 최신순.
   *
   * 인기·관심사 섹션과 달리 집계를 보지 않는다. 이 섹션의 존재 이유가 **표본이 쌓이기 전의
   * 신선도**이기 때문이다 — 여기에 재생 수를 섞으면 인기 섹션과 같은 목록이 된다.
   */
  async findRecent(
    limit: number,
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<Content[]> {
    return (
      this.applyVisibility(
        this.scoped(manager).createQueryBuilder('content'),
        now,
        market,
      )
        .orderBy('content.published_at', 'DESC')
        // 같은 배치로 업로드된 콘텐츠는 `published_at`이 동일할 수 있다
        .addOrderBy('content.id', 'DESC')
        .limit(limit)
        .getMany()
    );
  }

  /**
   * 탐색 인기 콘텐츠(`explore.md` 4.1-1) — **사용자가 고른 집계 구간**의 재생·완청 수 기준.
   * 피드의 인기 섹션과 구간 토글(explore-api.md 4.2-1)이 같은 조회를 쓴다.
   *
   * **`week` · `month`는 확정된 구간만 읽는다**(domain.md 5.4 — `is_final`). 진행 중인 구간을
   * 쓰면 주초·월초에 표본이 부족해 랭킹이 무너진다. **`all`에는 그 조건을 걸지 않는다** —
   * 전체 구간은 끝나는 시점이 없어 확정·진행 중 구분 자체가 없고, 걸면 아무것도 나오지 않는다.
   *
   * **직전 확정 구간이 없는 배포 첫 주·첫 달에도 목록을 비우지 않는다**(합의 2026-08-06을 세
   * 구간 각각에 적용 — `explore.md` 4.1-1). `LEFT JOIN`이라 집계 행이 하나도 없으면 전부 0으로
   * 동점이 되고, 그때는 뒤의 정렬 키(신선도)가 순서를 정한다.
   *
   * 정렬 키를 **전부 내림차순으로 맞춘다.** 방향이 섞이면 아래 행 비교로 keyset을 표현할 수
   * 없다(`findExplorePage`와 같은 구조, 키가 하나 더 많다).
   */
  async findPopularPage(
    query: PopularPageQuery,
    periodStart: string,
    manager?: EntityManager,
  ): Promise<RankedPopularContent[]> {
    // 전체 구간에는 확정 개념이 없다 — `findCandidates`가 `all`을 조인할 때와 같은 방식이다
    const isFinalCondition =
      query.periodType === StatsPeriodType.ALL
        ? ''
        : ' AND stat.is_final = true';

    const builder = this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .leftJoin(
          'content_stats',
          'stat',
          `stat.content_id = content.id
             AND stat.period_type = :periodType
             AND stat.period_start = :periodStart${isFinalCondition}`,
          { periodType: query.periodType, periodStart },
        )
        .addSelect(RANKING_PLAY_COUNT, RANKING_PLAY_COUNT_ALIAS)
        .addSelect(RANKING_COMPLETE_COUNT, RANKING_COMPLETE_COUNT_ALIAS),
      query.now,
      query.market,
    );

    if (query.cursor) {
      builder.andWhere(
        `(${RANKING_PLAY_COUNT}, ${RANKING_COMPLETE_COUNT}, content.published_at, content.id) < (:cursorPlayCount, :cursorCompleteCount, :cursorPublishedAt, :cursorId)`,
        {
          cursorPlayCount: query.cursor.playCount,
          cursorCompleteCount: query.cursor.completeCount,
          cursorPublishedAt: query.cursor.publishedAt,
          cursorId: query.cursor.id,
        },
      );
    }

    const { entities, raw } = await builder
      .orderBy(RANKING_PLAY_COUNT, 'DESC')
      .addOrderBy(RANKING_COMPLETE_COUNT, 'DESC')
      .addOrderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'DESC')
      .limit(query.limit + 1)
      .getRawAndEntities<RankingRow>();

    return entities.map((content, index) => ({
      content,
      playCount: Number(raw[index]?.[RANKING_PLAY_COUNT_ALIAS] ?? 0),
      completeCount: Number(raw[index]?.[RANKING_COMPLETE_COUNT_ALIAS] ?? 0),
    }));
  }

  /**
   * 탐색 주제 필터의 단일 목록(explore-api.md 4.2) — **추천 랭킹 순**의 커서 페이지.
   *
   * 랭킹은 전체 구간 재생 수(인기) → `published_at`(신선도) 순이며, **전부 내림차순으로
   * 맞춘다.** 방향이 섞이면 아래 행 비교(`(a, b, c) < (:a, :b, :c)`)로 keyset을 표현할 수
   * 없어 tie-break마다 조건이 갈라진다.
   *
   * **offset을 쓰지 않는 이유**는 라이브러리와 같다(convention.md 5.3) — 목록 앞쪽이 바뀌면
   * offset은 중복·누락을 만든다. 여기서는 콘텐츠 발행·집계 갱신이 그 역할을 한다.
   *
   * **다음 페이지 존재 여부를 세지 않고 한 건 더 읽는다.** COUNT를 따로 돌리면 같은 조건을
   * 두 번 스캔한다. 판정은 호출부가 한다(architecture.md 3.2).
   */
  async findExplorePage(
    query: ExplorePageQuery,
    manager?: EntityManager,
  ): Promise<RankedContent[]> {
    const builder = this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .leftJoin(
          'content_stats',
          'stat',
          'stat.content_id = content.id AND stat.period_type = :allPeriod AND stat.period_start = :allPeriodStart',
          {
            allPeriod: StatsPeriodType.ALL,
            allPeriodStart: ALL_TIME_PERIOD_START,
          },
        )
        .addSelect(RANKING_PLAY_COUNT, RANKING_PLAY_COUNT_ALIAS),
      query.now,
      query.market,
    );

    this.applyTopicFilter(builder, query.topicIds);

    if (query.cursor) {
      // Postgres 행 비교 — 세 정렬 키의 tie-break를 한 조건으로 표현한다
      builder.andWhere(
        `(${RANKING_PLAY_COUNT}, content.published_at, content.id) < (:cursorPlayCount, :cursorPublishedAt, :cursorId)`,
        {
          cursorPlayCount: query.cursor.playCount,
          cursorPublishedAt: query.cursor.publishedAt,
          cursorId: query.cursor.id,
        },
      );
    }

    const { entities, raw } = await builder
      .orderBy(RANKING_PLAY_COUNT, 'DESC')
      .addOrderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'DESC')
      .limit(query.limit + 1)
      .getRawAndEntities<RankingRow>();

    return entities.map((content, index) => ({
      content,
      playCount: Number(raw[index]?.[RANKING_PLAY_COUNT_ALIAS] ?? 0),
    }));
  }

  /**
   * 키워드 검색 한 페이지(explore-api.md 4.5) — **관련도 순**의 커서 페이지. `tagOnly`(`#태그`)면 태그 정확
   * 일치만 찾고 1순위 가중 합산 대신 상수를 쓴다(KAN-218).
   *
   * 정렬은 매칭 필드 가중 합(`SEARCH_SCORE`) → 제목 유사도 → 직전 확정 월 재생 수 →
   * 신선도 순이며(`explore.md` 4.5-5의 우선순위·동점 해소 체인 그대로), **전부
   * 내림차순으로 맞춘다** — 방향이 섞이면 행 비교로 keyset을 표현할 수 없다
   * (`findPopularPage`와 같은 구조, 키가 둘 더 많다).
   *
   * 인기 tie-break가 **직전 확정 월**인 이유: 순위·리포팅은 직전 확정 구간을 쓴다는
   * 규칙(domain.md 5.4)의 적용이고, 기본 구간(월간 — `explore.md` 4.1-1)과 같은 구간을
   * 보게 한다. `periodStart` 환산은 Service의 몫이다.
   */
  async findSearchPage(
    query: SearchPageQuery,
    monthPeriodStart: string,
    manager?: EntityManager,
  ): Promise<RankedSearchContent[]> {
    const score = query.tagOnly
      ? TAG_ONLY_SEARCH_SCORE
      : query.matchSeriesTitle
        ? SEARCH_SCORE_WITH_SERIES
        : SEARCH_SCORE;
    const builder = this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .leftJoin(
          'content_stats',
          'stat',
          `stat.content_id = content.id
             AND stat.period_type = :monthPeriod
             AND stat.period_start = :monthPeriodStart
             AND stat.is_final = true`,
          { monthPeriod: StatsPeriodType.MONTH, monthPeriodStart },
        )
        .addSelect(score, SEARCH_SCORE_ALIAS)
        .addSelect(SEARCH_TITLE_SIMILARITY, SEARCH_TITLE_SIMILARITY_ALIAS)
        .addSelect(RANKING_PLAY_COUNT, RANKING_PLAY_COUNT_ALIAS),
      query.now,
      query.market,
    ).andWhere(
      query.tagOnly
        ? SEARCH_MATCH_TAG_EXACT
        : `(${SEARCH_MATCH_TITLE} OR ${SEARCH_MATCH_TAG} OR ${SEARCH_MATCH_AUTHOR} OR ${SEARCH_MATCH_TOPIC} OR ${SEARCH_MATCH_DESCRIPTION}${
            query.matchSeriesTitle ? ` OR ${SEARCH_MATCH_SERIES_TITLE}` : ''
          })`,
    );

    builder.setParameters({
      searchQuery: query.normalizedQuery,
      searchPattern: `%${escapeLikePattern(query.normalizedQuery)}%`,
    });

    if (query.topicIds.length > 0) {
      this.applyTopicFilter(builder, query.topicIds);
    }

    if (query.cursor) {
      // Postgres 행 비교 — 다섯 정렬 키의 tie-break를 한 조건으로 표현한다
      builder.andWhere(
        `(${score}, ${SEARCH_TITLE_SIMILARITY}, ${RANKING_PLAY_COUNT}, content.published_at, content.id) < (:cursorScore, :cursorTitleSimilarity, :cursorPlayCount, :cursorPublishedAt, :cursorId)`,
        {
          cursorScore: query.cursor.score,
          cursorTitleSimilarity: query.cursor.titleSimilarity,
          cursorPlayCount: query.cursor.playCount,
          cursorPublishedAt: query.cursor.publishedAt,
          cursorId: query.cursor.id,
        },
      );
    }

    const { entities, raw } = await builder
      .orderBy(score, 'DESC')
      .addOrderBy(SEARCH_TITLE_SIMILARITY, 'DESC')
      .addOrderBy(RANKING_PLAY_COUNT, 'DESC')
      .addOrderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'DESC')
      .limit(query.limit + 1)
      .getRawAndEntities<SearchRow>();

    return entities.map((content, index) => ({
      content,
      score: Number(raw[index]?.[SEARCH_SCORE_ALIAS] ?? 0),
      titleSimilarity: Number(raw[index]?.[SEARCH_TITLE_SIMILARITY_ALIAS] ?? 0),
      playCount: Number(raw[index]?.[RANKING_PLAY_COUNT_ALIAS] ?? 0),
    }));
  }

  /**
   * 관리자 콘텐츠 목록(admin.md 5장) — 상태를 가리지 않고 최신순. 운영 화면이라 offset을
   * 허용한다(convention.md 5.3).
   */
  async findAdminPage(
    query: AdminContentPageQuery,
    manager?: EntityManager,
  ): Promise<{ items: Content[]; total: number }> {
    const builder = this.scoped(manager)
      .createQueryBuilder('content')
      .orderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    if (query.status) {
      builder.andWhere('content.status = :status', { status: query.status });
    }
    if (query.market) {
      builder.andWhere('content.market = :market', { market: query.market });
    }

    const [items, total] = await builder.getManyAndCount();
    return { items, total };
  }

  /**
   * 시리즈별 **노출 중인** 편과 그 편에 대한 이 사용자의 상태 — 드립 순서 필터의 "다음 편" 판정 입력(KAN-134, 규칙 ②′).
   * 후보 풀이 아니라 카탈로그 전체에서 읽는다 — 풀은 상한(인기순 300건)으로 잘리고 이미 본 편을 빼므로, 풀만 보면 "사이에
   * 노출 중인 편이 있는지·그 편을 이미 받았는지"를 알 수 없다. 노출 조건은 후보 조회와 같다(시장 포함).
   *
   * 사용자 상태는 후보 필터(`excludeSeenByUserId`)와 같은 원천을 원시 SQL로 본다 — `received`는 라이브러리에 한 번이라도
   * 들어온 적(소프트 삭제분 포함), `held`는 지금 라이브러리에 있고(삭제 안 됨) 완청 전, `excluded`는 드립 영구 제외.
   */
  async findVisibleSeriesEpisodesForUser(
    seriesIds: string[],
    userId: string,
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<
    {
      seriesId: string;
      contentId: string;
      episodeNo: number;
      received: boolean;
      held: boolean;
      excluded: boolean;
    }[]
  > {
    if (seriesIds.length === 0) {
      return [];
    }

    const rows = await this.applyVisibility(
      this.scoped(manager).createQueryBuilder('content'),
      now,
      market,
    )
      .select('content.series_id', 'series_id')
      .addSelect('content.id', 'content_id')
      .addSelect('content.episode_no', 'episode_no')
      .addSelect(
        `EXISTS (
           SELECT 1 FROM library_items received
           WHERE received.content_id = content.id AND received.user_id = :seriesUserId
         )`,
        'received',
      )
      .addSelect(
        `EXISTS (
           SELECT 1 FROM library_items held
           WHERE held.content_id = content.id AND held.user_id = :seriesUserId
             AND held.deleted_at IS NULL AND held.status <> :completedStatus
         )`,
        'held',
      )
      .addSelect(
        `EXISTS (
           SELECT 1 FROM drip_excluded_contents dripped
           WHERE dripped.content_id = content.id AND dripped.user_id = :seriesUserId
         )`,
        'excluded',
      )
      .andWhere('content.series_id IN (:...seriesIds)', { seriesIds })
      .andWhere('content.episode_no IS NOT NULL')
      .setParameter('seriesUserId', userId)
      .setParameter('completedStatus', LibraryItemStatus.COMPLETED)
      .orderBy('content.series_id', 'ASC')
      .addOrderBy('content.episode_no', 'ASC')
      .getRawMany<{
        series_id: string;
        content_id: string;
        episode_no: number;
        received: boolean;
        held: boolean;
        excluded: boolean;
      }>();

    return rows.map((row) => ({
      seriesId: row.series_id,
      contentId: row.content_id,
      episodeNo: Number(row.episode_no),
      received: row.received === true,
      held: row.held === true,
      excluded: row.excluded === true,
    }));
  }

  /** 시리즈 화면(`GET /series/:id`)의 편 목록 — 노출 중인 편만, 편 번호순 */
  async findVisibleBySeriesId(
    seriesId: string,
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<Content[]> {
    return this.findVisibleBySeriesIds([seriesId], now, market, manager);
  }

  /** 여러 시리즈의 노출 중인 편 — 시리즈 → 편 번호순. 탐색 시리즈 카드(표지·편 수·주제)의 재료를 한 번에 읽는다 */
  async findVisibleBySeriesIds(
    seriesIds: string[],
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<Content[]> {
    if (seriesIds.length === 0) {
      return [];
    }

    return this.applyVisibility(
      this.scoped(manager).createQueryBuilder('content'),
      now,
      market,
    )
      .andWhere('content.series_id IN (:...seriesIds)', { seriesIds })
      .andWhere('content.episode_no IS NOT NULL')
      .orderBy('content.series_id', 'ASC')
      .addOrderBy('content.episode_no', 'ASC')
      .addOrderBy('content.published_at', 'ASC')
      .addOrderBy('content.id', 'ASC')
      .getMany();
  }

  /**
   * 관리자 시리즈 목록의 편 현황 — 시리즈 × 상태별 편 수와 발행 중 최대 편 번호. 상태 3값을 한 번에 센다
   * (시리즈마다 따로 묻지 않는다 — architecture.md 3.4)
   */
  async countEpisodesBySeries(
    seriesIds: string[],
    manager?: EntityManager,
  ): Promise<
    {
      seriesId: string;
      published: number;
      withdrawn: number;
      expired: number;
      maxPublishedEpisodeNo: number | null;
    }[]
  > {
    if (seriesIds.length === 0) {
      return [];
    }

    const rows = await this.scoped(manager)
      .createQueryBuilder('content')
      .select('content.series_id', 'series_id')
      .addSelect(
        'COUNT(*) FILTER (WHERE content.status = :published)',
        'published',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE content.status = :withdrawn)',
        'withdrawn',
      )
      .addSelect('COUNT(*) FILTER (WHERE content.status = :expired)', 'expired')
      .addSelect(
        'MAX(content.episode_no) FILTER (WHERE content.status = :published)',
        'max_published_episode_no',
      )
      .where('content.series_id IN (:...seriesIds)', { seriesIds })
      .setParameters({
        published: ContentStatus.PUBLISHED,
        withdrawn: ContentStatus.WITHDRAWN,
        expired: ContentStatus.EXPIRED,
      })
      .groupBy('content.series_id')
      .getRawMany<{
        series_id: string;
        published: string;
        withdrawn: string;
        expired: string;
        max_published_episode_no: number | null;
      }>();

    return rows.map((row) => ({
      seriesId: row.series_id,
      published: Number(row.published),
      withdrawn: Number(row.withdrawn),
      expired: Number(row.expired),
      maxPublishedEpisodeNo:
        row.max_published_episode_no === null
          ? null
          : Number(row.max_published_episode_no),
    }));
  }

  /**
   * 같은 시리즈·같은 번호로 **발행 중인** 편이 있는가 — 부분 유니크(`uq_contents_series_id_episode_no_published`)의
   * 사전 확인. 라이선스 만료 전 `published`도 센다(인덱스와 같은 조건 — 노출 조건이 아니라 상태다)
   */
  async existsPublishedEpisode(
    seriesId: string,
    episodeNo: number,
    excludeContentId: string | null,
    manager?: EntityManager,
  ): Promise<boolean> {
    const builder = this.scoped(manager)
      .createQueryBuilder('content')
      .where('content.series_id = :seriesId', { seriesId })
      .andWhere('content.episode_no = :episodeNo', { episodeNo })
      .andWhere('content.status = :published', {
        published: ContentStatus.PUBLISHED,
      });

    if (excludeContentId !== null) {
      builder.andWhere('content.id <> :excludeContentId', { excludeContentId });
    }

    return builder.getExists();
  }

  /** 시리즈에 이미 올라간 편들의 시장(상태 무관) — 한 시리즈에 시장이 섞이지 않게 업로드가 본다 */
  async findMarketsBySeriesId(
    seriesId: string,
    manager?: EntityManager,
  ): Promise<UserMarket[]> {
    const rows = await this.scoped(manager)
      .createQueryBuilder('content')
      .select('DISTINCT content.market', 'market')
      .where('content.series_id = :seriesId', { seriesId })
      .getRawMany<{ market: UserMarket }>();

    return rows.map((row) => row.market);
  }

  async saveAll(
    contents: Content[],
    manager?: EntityManager,
  ): Promise<Content[]> {
    return this.scoped(manager).save(contents);
  }

  create(content: Partial<Content>): Content {
    return this.repository.create(content);
  }
}
