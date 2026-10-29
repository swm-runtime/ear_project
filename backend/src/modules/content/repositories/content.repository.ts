import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { escapeLikePattern } from '@/common/utils/search-text.util';
import { vectorTransformer } from '@/common/utils/vector.transformer';

import {
  CONTENT_SCOPE_CONDITION,
  contentScopeParameters,
} from '../content.visibility';
import {
  EMBEDDING_MODEL_ID,
  RELATED_CONTENT_MIN_SIMILARITY,
  SEARCH_CORRECTION_CANDIDATE_LIMIT,
  SEARCH_CORRECTION_MAX_LENGTH_DIFF,
  SEARCH_CORRECTION_MIN_TERM_LENGTH,
  SEARCH_CORRECTION_PARTICLE_PATTERN,
  SEARCH_RRF_K,
  SEARCH_SEMANTIC_MIN_SIMILARITY,
  SEARCH_SEMANTIC_SCRIPT_MIN_SIMILARITY_WITH_TITLE,
  SEARCH_SEMANTIC_TITLE_MIN_SIMILARITY,
  SEARCH_SEMANTIC_TOP_K,
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
import { pickSearchCorrection } from '../content.search-correction';
import {
  AdminContentPageQuery,
  ContentCandidateQuery,
  ExplorePageQuery,
  HybridSearchPageQuery,
  PopularPageQuery,
  RankedHybridContent,
  RankedContent,
  RankedPopularContent,
  RankedSearchContent,
  RelatedContentQuery,
  RrfSearchCursorPosition,
  SearchCorrectionQuery,
  SearchEngine,
  SearchPageQuery,
} from '../content.types';
import { Content } from '../entities/content.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { COMPLETION_REACHED_RATIO } from '@/modules/library/library.constant';
import { SERIES_HOLD_LISTENING_WINDOW_MS } from '../content.constant';
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

/** 하이브리드 검색의 한 줄(`findHybridSearchPage`) — pg 드라이버는 bigint·double을 문자열로 줄 수 있어 숫자로 다시 읽는다 */
interface HybridSearchRow {
  id: string;
  rrf: string | number;
  play_count: string | number;
  matched_keyword: boolean;
  matched_semantic: boolean;
  keyword_total: string | number;
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

  /**
   * 시리즈 카드 모드(KAN-134 확정 설계 4번 — `SERIES_EXPLORE_CARDS_ENABLED`)의 **시리즈 대표 편만 남기기.** 같은 시리즈 편들 중
   * 그 목록의 정렬 키로 가장 앞선 편 하나(= 편 점수의 최댓값 자리)와 단일 콘텐츠만 남긴다. 탐색이 대표 편을 카드로 바꾼다.
   *
   * `ranked`는 **같은 필터를 건 두 번째 빌더**다(노출·시장·주제·검색 일치 — 커서·정렬·limit 없이). 그 위에서
   * `ROW_NUMBER() OVER (PARTITION BY series_id ORDER BY <정렬 키>) = 1`인 편을 대표로 고른다. 필터가 윈도 **앞**에 걸리므로 대표는
   * "그 목록에 들어온 편 중 가장 앞 편"이다. 필터 조각은 alias `content`·`stat`을 그대로 쓰는데, 부분 질의 안의 같은 alias가
   * 바깥을 가리므로 같은 문자열·같은 파라미터가 부분 질의 안에서 그대로 성립한다.
   *
   * 남은 행 위에서 바깥 질의가 종전 그대로 키셋 커서·정렬·limit을 건다 — 페이지 경계·커서 모양이 꺼진 모드와 같고, 한 시리즈는
   * 목록 전체에서 한 번이며, 빈·짧은 페이지가 생기지 않는다. 대표 판정은 커서와 무관하다(부분 질의에 커서 조건이 없다).
   */
  private applySeriesAnchors(
    builder: SelectQueryBuilder<Content>,
    ranked: SelectQueryBuilder<Content>,
    orderKeys: string[],
  ): void {
    const anchors = ranked
      .select('content.id', 'anchor_id')
      .addSelect(
        `ROW_NUMBER() OVER (PARTITION BY content.series_id ORDER BY ${orderKeys.join(', ')})`,
        'anchor_rank',
      )
      .andWhere('content.series_id IS NOT NULL');

    builder
      .andWhere(
        `(content.series_id IS NULL OR content.id IN (
           SELECT series_anchor.anchor_id FROM (${anchors.getQuery()}) series_anchor
           WHERE series_anchor.anchor_rank = 1
         ))`,
      )
      .setParameters(anchors.getParameters());
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

    if (query.randomOrder) {
      // 첫 드립 무작위 실험(KAN-291) — 인기순 상한이 무작위 범위를 좁히지 않게 자르는 기준을 무작위로 둔다
      return builder.orderBy('RANDOM()').limit(query.limit).getMany();
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
    /** 시리즈 카드 모드 — 시리즈마다 가장 최신 편 하나만(`applySeriesAnchors`) */
    seriesAnchorsOnly = false,
  ): Promise<Content[]> {
    const base = () =>
      this.applyVisibility(
        this.scoped(manager).createQueryBuilder('content'),
        now,
        market,
      );
    const builder = base();

    if (seriesAnchorsOnly) {
      this.applySeriesAnchors(builder, base(), [
        'content.published_at DESC',
        'content.id DESC',
      ]);
    }

    return (
      builder
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

    const base = () =>
      this.applyVisibility(
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
    const builder = base();

    if (query.seriesAnchorsOnly) {
      this.applySeriesAnchors(builder, base(), [
        `${RANKING_PLAY_COUNT} DESC`,
        `${RANKING_COMPLETE_COUNT} DESC`,
        'content.published_at DESC',
        'content.id DESC',
      ]);
    }

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
    const base = () => {
      const filtered = this.applyVisibility(
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
      this.applyTopicFilter(filtered, query.topicIds);
      return filtered;
    };
    const builder = base();

    if (query.seriesAnchorsOnly) {
      this.applySeriesAnchors(builder, base(), [
        `${RANKING_PLAY_COUNT} DESC`,
        'content.published_at DESC',
        'content.id DESC',
      ]);
    }

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
    const base = () => {
      const filtered = this.applyVisibility(
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

      filtered.setParameters({
        searchQuery: query.normalizedQuery,
        searchPattern: `%${escapeLikePattern(query.normalizedQuery)}%`,
      });

      if (query.topicIds.length > 0) {
        this.applyTopicFilter(filtered, query.topicIds);
      }

      return filtered;
    };
    const builder = base();

    if (query.seriesAnchorsOnly) {
      this.applySeriesAnchors(builder, base(), [
        `${score} DESC`,
        `${SEARCH_TITLE_SIMILARITY} DESC`,
        `${RANKING_PLAY_COUNT} DESC`,
        'content.published_at DESC',
        'content.id DESC',
      ]);
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
   * 하이브리드 검색 한 페이지(KAN-238 — `explore.md` 4.5-5). 공통 필터(노출·시장·`topic_ids`) 뒤 두 엔진을 CTE로 돌려
   * RRF(`Σ 1/(k + 엔진 내 순위)`)로 합친다.
   *
   * - `keyword` — 종전 부분 일치(제목 > 태그 > 저자 > 주제명 > 설명, 시리즈 제목은 스위치)와 **종전 정렬 키 그대로**
   *   (가중 합 → 제목 유사도 → 직전 확정 월 재생 수 → 신선도 → id)의 `ROW_NUMBER`. 가중이 전부 양수라 "점수 > 0"이 곧
   *   "어느 필드든 맞음"이다(`findSearchPage`의 OR 조건과 같은 집합).
   * - `semantic` — 질의 벡터를 **제목 벡터**(`content_title_embeddings`)와 **대본 벡터**(`content_embeddings`) 둘에 견준다.
   *   제목 코사인 ≥ `SEARCH_SEMANTIC_TITLE_MIN_SIMILARITY`(0.34)이거나 대본 코사인 ≥ 대본 하한이면 맞음이고, 대본 하한은 그 편에
   *   유효한 제목 벡터가 있으면 `SEARCH_SEMANTIC_SCRIPT_MIN_SIMILARITY_WITH_TITLE`(0.45), 없으면 종전 `SEARCH_SEMANTIC_MIN_SIMILARITY`
   *   (0.3)다 — 제목 벡터가 하나도 없는 동안(백필 전·생성 실패) 결과는 종전과 같다. 순서는 **하한을 넘은 폭**(`margin` — 두 벡터
   *   중 큰 쪽)이고 상위 K. 짧은 질의 ↔ 대본 전문은 코사인이 0.2~0.3대에 몰려 소음이 됐다(2026-10-22 실측 — 상수 주석).
   *   대본 벡터는 현행 모델이고 대본 버전이 일치하는 행만(domain.md 5.6 — 추천 스코어링과 같은 조건), 제목 벡터는 현행 모델이고
   *   `source_text`가 지금 제목과 같은 행만이다. 질의 벡터가 없으면(결손) 빈 CTE다. ANN 인덱스 없이 전수 계산한다(수천 편 상한).
   *
   * **질의 벡터 없이 시작한 검색은 이 쿼리를 타지 않는다**(KAN-242) — Service가 종전 키워드 검색(`findSearchPage`)에 맡긴다.
   * 여기서 벡터가 없는 경우는 첫 페이지가 의미 엔진을 썼는데 이번 페이지에서 결손난 커서 페이지뿐이다. 그때 의미 CTE는 비고
   * RRF는 키워드 순위의 단조 함수다. 동점(두 엔진이 섞일 때만 생긴다)은 인기 → `published_at` → id.
   *
   * 키셋은 최종 정렬 키 넷 전부(`rrf`, 재생 수, `published_at`, id)다. **`rrf`는 행 자기 값이 아니라 매칭 집합 안의 순위에서
   * 나온다** — 페이지 사이에 앞쪽에 편이 발행되면 같은 행의 순위가 밀려 `rrf`가 작아지므로 경계 행이 다시 나오고(중복), 지워지면
   * 한 행을 건너뛸 수 있다(누락). 의미 엔진을 쓰는 검색에서는 이 미세 흔들림을 감수한다(explore-api.md 4.5). 종전 키워드 커서는
   * 키가 전부 행 자기 값이라 이 흔들림이 없고, 그래서 벡터 없는 검색은 그쪽에 맡긴다.
   *
   * Raw SQL이다(architecture.md 3.4) — 공통 필터는 QueryBuilder로 만들어 같은 조각(`CONTENT_SCOPE_CONDITION`·주제 필터)을
   * 그대로 쓰고, 그 위에 CTE를 얹는다. 엔티티는 고른 id로 한 번 더 읽는다(최대 `limit + 1`건).
   */
  async findHybridSearchPage(
    query: HybridSearchPageQuery & { cursor: RrfSearchCursorPosition | null },
    monthPeriodStart: string,
    manager?: EntityManager,
  ): Promise<{ items: RankedHybridContent[]; keywordMatched: boolean }> {
    const score = query.matchSeriesTitle
      ? SEARCH_SCORE_WITH_SERIES
      : SEARCH_SCORE;
    const base = this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .select('content.id', 'id')
        .addSelect('content.series_id', 'series_id')
        .addSelect('content.published_at', 'published_at')
        .addSelect('content.content_version', 'content_version')
        .addSelect('content.title', 'title')
        .addSelect(RANKING_PLAY_COUNT, 'play_count')
        .addSelect(score, 'kw_score')
        .addSelect(SEARCH_TITLE_SIMILARITY, 'kw_title_similarity')
        .leftJoin(
          'content_stats',
          'stat',
          `stat.content_id = content.id
           AND stat.period_type = :monthPeriod
           AND stat.period_start = :monthPeriodStart
           AND stat.is_final = true`,
          { monthPeriod: StatsPeriodType.MONTH, monthPeriodStart },
        ),
      query.now,
      query.market,
    ).setParameters({
      searchQuery: query.normalizedQuery,
      searchPattern: `%${escapeLikePattern(query.normalizedQuery)}%`,
    });

    if (query.topicIds.length > 0) {
      this.applyTopicFilter(base, query.topicIds);
    }

    const [baseSql, baseParams] = base.getQueryAndParameters();
    const params: unknown[] = [...(baseParams as unknown[])];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    // 질의 벡터는 pgvector 텍스트 표현(`[0.1,...]`)으로 보내 `::vector`로 캐스팅한다 — 저장 경로(`vectorTransformer`)와 같은 표현
    const semanticCte = query.queryVector
      ? (() => {
          const vector = param(vectorTransformer.to(query.queryVector));
          const model = param(EMBEDDING_MODEL_ID);
          return `SELECT scored.id,
                         ROW_NUMBER() OVER (ORDER BY scored.margin DESC, scored.id DESC) AS rank
                    FROM (
                      SELECT matched.id,
                             GREATEST(matched.title_similarity - ${SEARCH_SEMANTIC_TITLE_MIN_SIMILARITY},
                                      matched.script_similarity - matched.script_min) AS margin
                        FROM (
                          SELECT base.id,
                                 1 - (title_embedding.embedding <=> ${vector}::vector) AS title_similarity,
                                 1 - (embedding.embedding <=> ${vector}::vector) AS script_similarity,
                                 CASE WHEN title_embedding.id IS NULL THEN ${SEARCH_SEMANTIC_MIN_SIMILARITY}
                                      ELSE ${SEARCH_SEMANTIC_SCRIPT_MIN_SIMILARITY_WITH_TITLE} END AS script_min
                            FROM base
                            LEFT JOIN content_embeddings embedding
                              ON embedding.content_id = base.id
                             AND embedding.model = ${model}
                             AND embedding.content_version = base.content_version
                            LEFT JOIN content_title_embeddings title_embedding
                              ON title_embedding.content_id = base.id
                             AND title_embedding.model = ${model}
                             AND title_embedding.source_text = base.title
                        ) matched
                       WHERE matched.title_similarity >= ${SEARCH_SEMANTIC_TITLE_MIN_SIMILARITY}
                          OR matched.script_similarity >= matched.script_min
                    ) scored
                   ORDER BY scored.margin DESC, scored.id DESC
                   LIMIT ${SEARCH_SEMANTIC_TOP_K}`;
        })()
      : 'SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false';

    const conditions: string[] = [];

    if (query.seriesAnchorsOnly) {
      conditions.push('(ranked.series_id IS NULL OR ranked.anchor_rank = 1)');
    }

    if (query.cursor) {
      conditions.push(
        `(ranked.rrf, ranked.play_count, ranked.published_at, ranked.id) < (${param(query.cursor.rrf)}::double precision, ${param(query.cursor.playCount)}::bigint, ${param(query.cursor.publishedAt)}::timestamptz, ${param(query.cursor.id)}::uuid)`,
      );
    }

    const limit = param(query.limit + 1);
    // 시리즈 카드는 시리즈를 대표한다 — 어느 엔진에서 왔는가도 접힌 편까지 합친다(꺼져 있으면 편 자기 값)
    const seriesPartition = query.seriesAnchorsOnly
      ? 'PARTITION BY COALESCE(fused.series_id, fused.id)'
      : 'PARTITION BY fused.id';

    const sql = `
      WITH base AS (${baseSql}),
      keyword AS (
        SELECT base.id,
               ROW_NUMBER() OVER (
                 ORDER BY base.kw_score DESC, base.kw_title_similarity DESC, base.play_count DESC,
                          base.published_at DESC, base.id DESC
               ) AS rank
          FROM base
         WHERE base.kw_score > 0
      ),
      semantic AS (${semanticCte}),
      fused AS (
        SELECT base.id, base.series_id, base.published_at, base.play_count,
               (COALESCE(1.0::double precision / (${SEARCH_RRF_K} + keyword.rank), 0)
                + COALESCE(1.0::double precision / (${SEARCH_RRF_K} + semantic.rank), 0))::double precision AS rrf,
               keyword.rank IS NOT NULL AS by_keyword,
               semantic.rank IS NOT NULL AS by_semantic
          FROM base
          LEFT JOIN keyword ON keyword.id = base.id
          LEFT JOIN semantic ON semantic.id = base.id
         WHERE keyword.id IS NOT NULL OR semantic.id IS NOT NULL
      ),
      ranked AS (
        SELECT fused.*,
               ROW_NUMBER() OVER (
                 PARTITION BY fused.series_id
                 ORDER BY fused.rrf DESC, fused.play_count DESC, fused.published_at DESC, fused.id DESC
               ) AS anchor_rank,
               bool_or(fused.by_keyword) OVER (${seriesPartition}) AS matched_keyword,
               bool_or(fused.by_semantic) OVER (${seriesPartition}) AS matched_semantic
          FROM fused
      )
      SELECT ranked.id, ranked.rrf, ranked.play_count, ranked.matched_keyword, ranked.matched_semantic,
             (SELECT count(*) FROM keyword)::int AS keyword_total
        FROM ranked
       ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY ranked.rrf DESC, ranked.play_count DESC, ranked.published_at DESC, ranked.id DESC
       LIMIT ${limit}`;

    const rows = await this.scoped(manager).manager.query<HybridSearchRow[]>(
      sql,
      params,
    );

    // 행이 없으면 키워드도 0건이다 — 키워드가 하나라도 맞으면 `fused`가 비지 않고, 대표 편 접기는 시리즈마다 하나를 남긴다
    // (커서 페이지의 빈 응답은 목록의 끝이라 교정 판정에 쓰지 않는다)
    if (rows.length === 0) {
      return { items: [], keywordMatched: false };
    }

    const contents = await this.scoped(manager).findBy({
      id: In(rows.map((row) => row.id)),
    });
    const contentById = new Map(
      contents.map((content) => [content.id, content]),
    );

    const items = rows.flatMap((row): RankedHybridContent[] => {
      const content = contentById.get(row.id);

      // 두 읽기 사이에 지워진 행(CASCADE)은 건너뛴다 — 정상 경로에서는 생기지 않는다
      if (!content) {
        return [];
      }

      const matchedBy: SearchEngine[] = [];
      if (row.matched_keyword) matchedBy.push('keyword');
      if (row.matched_semantic) matchedBy.push('semantic');

      return [
        {
          content,
          position: {
            order: 'rrf',
            rrf: Number(row.rrf),
            playCount: Number(row.play_count),
            publishedAt: content.publishedAt,
            id: content.id,
          },
          matchedBy,
        },
      ];
    });

    return { items, keywordMatched: Number(rows[0].keyword_total) > 0 };
  }

  /**
   * 노출·시장 조건을 지난 단건 — 없으면 `null`. 회수·만료·다른 시장을 **없음과 구분하지 않는다**(관련 콘텐츠의 기준 편 판정 —
   * `player-api.md` 4.8). 목록과 같은 `CONTENT_SCOPE_CONDITION`이라 "목록에 보이는 편이면 기준 편이 된다"가 성립한다
   */
  async findVisibleById(
    id: string,
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<Content | null> {
    return this.applyVisibility(
      this.scoped(manager).createQueryBuilder('content'),
      now,
      market,
    )
      .andWhere('content.id = :id', { id })
      .getOne();
  }

  /**
   * 관련 콘텐츠(KAN-240 — `player-api.md` 4.8): 기준 편과 **대본 임베딩이 비슷한 편**을 코사인 유사도 내림차순으로.
   *
   * - 기준 벡터는 DB의 기준 편 행이다(AI 서버를 부르지 않는다) — `content_embeddings`를 기준 편으로 한 번, 후보로 한 번 읽는
   *   셀프 조인. 기준 편 행도 **현행 모델 AND `content_version` 일치**여야 한다 — 재발행 후 미갱신 벡터는 없는 것과 같다.
   *   기준 벡터가 없으면 CROSS JOIN이 비어 결과가 0건이다(200 `items: []`).
   * - 후보는 목록과 같은 노출·시장 조건(`CONTENT_SCOPE_CONDITION` — 발행·라이선스·시장. 회수·만료는 `published`가 아니다),
   *   기준 편·`excludeIds` 제외, 후보 벡터도 현행 모델·버전 일치(검색 의미 엔진·추천 스코어링과 같은 조건 — domain.md 5.6).
   * - 유사도(`1 - (e <=> base)`)가 하한(`RELATED_CONTENT_MIN_SIMILARITY`) **이하면 뺀다.** 동률은 id 내림차순(결정적 순서).
   * - 시리즈 대표 편 접기를 하지 않는다 — 편 단위 목록이다. ANN 없이 전수 계산(수천 편 상한 — domain.md 5.6).
   *
   * Raw SQL이다(architecture.md 3.4) — 후보 필터는 QueryBuilder로 만들어 같은 조각을 쓰고 그 위에 코사인을 얹는다.
   * 엔티티는 고른 id로 한 번 더 읽어 순서대로 돌려준다(최대 `limit`건).
   */
  async findRelated(
    query: RelatedContentQuery,
    manager?: EntityManager,
  ): Promise<Content[]> {
    const candidates = this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .select('content.id', 'id')
        .addSelect('content.content_version', 'content_version'),
      query.now,
      query.market,
    ).andWhere('content.id <> :baseContentId', {
      baseContentId: query.baseContentId,
    });

    if (query.excludeIds.length > 0) {
      candidates.andWhere('content.id NOT IN (:...excludeIds)', {
        excludeIds: query.excludeIds,
      });
    }

    const [candidateSql, candidateParams] = candidates.getQueryAndParameters();
    const params: unknown[] = [...(candidateParams as unknown[])];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const baseId = param(query.baseContentId);
    const model = param(EMBEDDING_MODEL_ID);
    const limit = param(query.limit);

    const sql = `
      WITH candidate AS (${candidateSql}),
      base_embedding AS (
        SELECT embedding.embedding
          FROM content_embeddings embedding
          JOIN contents base_content
            ON base_content.id = embedding.content_id
           AND base_content.content_version = embedding.content_version
         WHERE embedding.content_id = ${baseId}::uuid
           AND embedding.model = ${model}
      )
      SELECT candidate.id
        FROM candidate
        JOIN content_embeddings embedding
          ON embedding.content_id = candidate.id
         AND embedding.model = ${model}
         AND embedding.content_version = candidate.content_version
       CROSS JOIN base_embedding
       WHERE 1 - (embedding.embedding <=> base_embedding.embedding) > ${RELATED_CONTENT_MIN_SIMILARITY}
       ORDER BY embedding.embedding <=> base_embedding.embedding, candidate.id DESC
       LIMIT ${limit}`;

    const rows = await this.scoped(manager).manager.query<{ id: string }[]>(
      sql,
      params,
    );

    if (rows.length === 0) {
      return [];
    }

    const contents = await this.scoped(manager).findBy({
      id: In(rows.map((row) => row.id)),
    });
    const contentById = new Map(
      contents.map((content) => [content.id, content]),
    );

    // 두 읽기 사이에 지워진 행(CASCADE)은 건너뛴다 — 정상 경로에서는 생기지 않는다
    return rows.flatMap((row) => {
      const content = contentById.get(row.id);
      return content ? [content] : [];
    });
  }

  /**
   * 오타 교정어 하나(KAN-238 — `explore.md` 4.5-5). 어휘 = 사용자 시장 발행 콘텐츠의 태그 항목 ∪ 주제명(노출 주제) ∪
   * 시리즈 제목(스위치) ∪ 제목 토큰(공백·문장부호로 나누고 끝 조사를 뗀 것, 2자 이상). 원문과 같은 말은 교정어가 아니다.
   *
   * 두 단계다. ① SQL — 글자 수가 질의 ±1 안(길이 가드)이고 자모 트라이그램 `similarity`(대칭)가 0보다 큰 어휘를
   * 유사도순 상한 개수만 ② `pickSearchCorrection` — 자모 편집 유사도로 재채점해 하한 이상 최댓값 하나, 동점은
   * 태그·주제명 → 빈도 → 길이 차이 → 코드포인트순. 트라이그램만으로는 "겅제"에 대해 경제·거의·정제가 같은 점수라
   * (자모 다섯 자에 트라이그램이 몇 개 안 된다) 편집 거리로 가른다 — 종전 `word_similarity`(비대칭)는 "거의"를 골랐다.
   *
   * 자모 컬럼·인덱스 없이 **질의 시 전수 비교**다 — 어휘는 수백 편 규모라 함수 호출 몇천 번이다(domain.md 5.1).
   * 어휘가 수만 항목으로 커지면 `search_terms` 머티리얼라이즈드 뷰 + trgm 인덱스를 그때 본다.
   */
  async findSearchCorrection(
    query: SearchCorrectionQuery,
    manager?: EntityManager,
  ): Promise<string | null> {
    const visible = this.applyVisibility(
      this.scoped(manager)
        .createQueryBuilder('content')
        .select('content.id', 'id')
        .addSelect('content.title', 'title')
        .addSelect('content.tags', 'tags')
        .addSelect('content.series_id', 'series_id'),
      query.now,
      query.market,
    );
    const [visibleSql, visibleParams] = visible.getQueryAndParameters();
    const params: unknown[] = [...(visibleParams as unknown[])];
    const param = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const q = param(query.normalizedQuery);
    const particle = param(SEARCH_CORRECTION_PARTICLE_PATTERN);
    // 우선순위 0 = 태그·주제명, 1 = 시리즈 제목·제목 토큰
    const seriesTerms = query.includeSeriesTitles
      ? `UNION ALL
         SELECT lower(matched_series.title), 1
           FROM visible JOIN series matched_series ON matched_series.id = visible.series_id`
      : '';

    const sql = `
      WITH visible AS (${visibleSql}),
      terms(term, priority) AS (
        SELECT lower(tag.value), 0
          FROM visible, jsonb_array_elements_text(visible.tags) AS tag(value)
        UNION ALL
        SELECT lower(topic.name), 0
          FROM visible
          JOIN content_topics linked ON linked.content_id = visible.id
          JOIN topics topic ON topic.id = linked.topic_id AND topic.is_visible = true
        ${seriesTerms}
        UNION ALL
        SELECT regexp_replace(token.value, ${particle}, '\\1'), 1
          FROM visible,
               regexp_split_to_table(lower(visible.title), '[[:space:][:punct:]·…‘’“”「」『』]+') AS token(value)
      ),
      candidates AS (
        SELECT term, min(priority) AS priority, count(*) AS frequency
          FROM terms
         WHERE char_length(term) >= ${SEARCH_CORRECTION_MIN_TERM_LENGTH}
           AND abs(char_length(term) - char_length(${q})) <= ${SEARCH_CORRECTION_MAX_LENGTH_DIFF}
           AND term <> ${q}
         GROUP BY term
      )
      SELECT term, priority, frequency
        FROM (
          SELECT term, priority, frequency,
                 similarity(hangul_to_jamo(${q}), hangul_to_jamo(term)) AS similarity
            FROM candidates
        ) scored
       WHERE similarity > 0
       ORDER BY similarity DESC, priority ASC, frequency DESC, term ASC
       LIMIT ${SEARCH_CORRECTION_CANDIDATE_LIMIT}`;

    const rows = await this.scoped(manager).manager.query<
      { term: string; priority: number; frequency: string | number }[]
    >(sql, params);

    return pickSearchCorrection(
      query.normalizedQuery,
      rows.map((row) => ({
        term: row.term,
        priority: Number(row.priority),
        frequency: Number(row.frequency),
      })),
    );
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
   * 들어온 적(소프트 삭제분 포함), `held`는 지금 라이브러리에 있고(삭제 안 됨) 완청 전 **또는 담지 않고 듣던 중**(아래), `excluded`는
   * 드립 영구 제외.
   *
   * **담지 않고 듣던 편도 `held`다**(2026-10-23 — 탐색 재생 자동 적립 폐기). 종전에는 탐색에서 1화를 듣다 나가도 자동 적립 행이
   * 다음 편을 기다리게 했는데, 행이 없어지자 다음 배치가 2화를 바로 줬다. 위치 > 0 · 완청 아님(위치·라이브러리·완청 신호 —
   * `COMPLETED_CONTENT_IDS_CTE`와 같은 정의) · 라이브러리에서 지운 적 없음 · **최근 `SERIES_HOLD_LISTENING_WINDOW_MS` 안에
   * 들었음**. 기간을 두는 이유: 라이브러리 행은 지워서 기다림을 풀 수 있지만 담지 않은 편은 풀 수단이 없다 — 듣다 그만둔
   * 편이 그 시리즈를 영영 막지 않게 한다.
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
        `(EXISTS (
           SELECT 1 FROM library_items held
           WHERE held.content_id = content.id AND held.user_id = :seriesUserId
             AND held.deleted_at IS NULL AND held.status <> :completedStatus
         ) OR (
           EXISTS (
             SELECT 1 FROM playback_progresses listening
             WHERE listening.content_id = content.id AND listening.user_id = :seriesUserId
               AND listening.position_sec > 0
               AND listening.updated_at > :listeningSince
               AND NOT (content.duration_sec > 0
                        AND listening.max_reached_sec >= content.duration_sec * CAST(:completionRatio AS numeric))
           )
           AND NOT EXISTS (
             SELECT 1 FROM library_items done
             WHERE done.content_id = content.id AND done.user_id = :seriesUserId
               AND (done.status = :completedStatus OR done.deleted_at IS NOT NULL)
           )
           AND NOT EXISTS (
             SELECT 1 FROM user_signals finished
             WHERE finished.content_id = content.id AND finished.user_id = :seriesUserId
               AND finished.action = 'complete'
           )
         ))`,
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
      .setParameter('completionRatio', COMPLETION_REACHED_RATIO)
      .setParameter(
        'listeningSince',
        new Date(now.getTime() - SERIES_HOLD_LISTENING_WINDOW_MS),
      )
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
