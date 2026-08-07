import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import {
  ALL_TIME_PERIOD_START,
  ContentStatus,
  StatsPeriodType,
} from '../content.enum';
import {
  ContentCandidateQuery,
  ExplorePageQuery,
  RankedContent,
} from '../content.types';
import { Content } from '../entities/content.entity';

/** 커서에 담기는 랭킹 1순위 값. `content_stats` 조인 결과이지 `contents`의 컬럼이 아니다 */
const RANKING_PLAY_COUNT = 'COALESCE(stat.play_count, 0)';
const RANKING_PLAY_COUNT_ALIAS = 'ranking_play_count';

interface RankingRow {
  [RANKING_PLAY_COUNT_ALIAS]: string | number;
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
   * 탐색 피드의 "인기 콘텐츠" 섹션(`explore.md` 4.1) — **직전 확정 구간**의 재생·완청 수 기준.
   *
   * 진행 중인 구간을 쓰면 주초에 표본이 부족해 랭킹이 무너지므로 `is_final = true` 행만
   * 조인한다(domain.md 5.4).
   *
   * **직전 확정 구간이 없는 배포 첫 주에도 섹션을 비우지 않는다**(합의 2026-08-06 —
   * `explore-api.md` 4.1). `LEFT JOIN`이라 집계 행이 하나도 없으면 전부 0으로 동점이 되고,
   * 그때는 뒤의 정렬 키(신선도)가 순서를 정한다 — 값이 모두 같아도 정렬상 앞서는 콘텐츠는
   * 존재하므로 응답 모양이 첫 주에만 달라지지 않는다.
   */
  async findPopular(
    periodStart: string,
    limit: number,
    now: Date,
    manager?: EntityManager,
  ): Promise<Content[]> {
    return this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .leftJoin(
          'content_stats',
          'stat',
          `stat.content_id = content.id
             AND stat.period_type = :weekPeriod
             AND stat.period_start = :periodStart
             AND stat.is_final = true`,
          { weekPeriod: StatsPeriodType.WEEK, periodStart },
        ),
      now,
    )
      .orderBy(RANKING_PLAY_COUNT, 'DESC')
      .addOrderBy('COALESCE(stat.complete_count, 0)', 'DESC')
      .addOrderBy('content.published_at', 'DESC')
      .addOrderBy('content.id', 'DESC')
      .limit(limit)
      .getMany();
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
