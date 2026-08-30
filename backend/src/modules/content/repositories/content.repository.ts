import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { escapeLikePattern } from '@/common/utils/search-text.util';

import {
  SEARCH_WEIGHT_AUTHOR,
  SEARCH_WEIGHT_DESCRIPTION,
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
 * 랭킹 1순위 — 매칭 필드 가중 합산(제목 > 저자 > 주제명 > 설명). 가중치가 2의 거듭제곱이라
 * 이 합산이 곧 문서의 필드 우선순위다(`content.constant.ts` 참조).
 */
const SEARCH_SCORE = `(
  (CASE WHEN ${SEARCH_MATCH_TITLE} THEN ${SEARCH_WEIGHT_TITLE} ELSE 0 END)
  + (CASE WHEN ${SEARCH_MATCH_AUTHOR} THEN ${SEARCH_WEIGHT_AUTHOR} ELSE 0 END)
  + (CASE WHEN ${SEARCH_MATCH_TOPIC} THEN ${SEARCH_WEIGHT_TOPIC} ELSE 0 END)
  + (CASE WHEN ${SEARCH_MATCH_DESCRIPTION} THEN ${SEARCH_WEIGHT_DESCRIPTION} ELSE 0 END)
)`;
const SEARCH_SCORE_ALIAS = 'search_score';

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
  ): SelectQueryBuilder<Content> {
    return builder
      .where('content.status = :status', { status: ContentStatus.PUBLISHED })
      .andWhere(
        '(content.license_expires_at IS NULL OR content.license_expires_at > :now)',
        { now },
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
    manager?: EntityManager,
  ): Promise<Content[]> {
    return (
      this.applyVisibility(
        this.scoped(manager).createQueryBuilder('content'),
        now,
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
   * 키워드 검색 한 페이지(explore-api.md 4.5) — **관련도 순**의 커서 페이지.
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
        .addSelect(SEARCH_SCORE, SEARCH_SCORE_ALIAS)
        .addSelect(SEARCH_TITLE_SIMILARITY, SEARCH_TITLE_SIMILARITY_ALIAS)
        .addSelect(RANKING_PLAY_COUNT, RANKING_PLAY_COUNT_ALIAS),
      query.now,
    ).andWhere(
      `(${SEARCH_MATCH_TITLE} OR ${SEARCH_MATCH_AUTHOR} OR ${SEARCH_MATCH_TOPIC} OR ${SEARCH_MATCH_DESCRIPTION})`,
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
        `(${SEARCH_SCORE}, ${SEARCH_TITLE_SIMILARITY}, ${RANKING_PLAY_COUNT}, content.published_at, content.id) < (:cursorScore, :cursorTitleSimilarity, :cursorPlayCount, :cursorPublishedAt, :cursorId)`,
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
      .orderBy(SEARCH_SCORE, 'DESC')
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
      builder.where('content.status = :status', { status: query.status });
    }

    const [items, total] = await builder.getManyAndCount();
    return { items, total };
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
