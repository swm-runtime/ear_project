import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { EnvironmentVariables } from '@/config/env.validation';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import {
  hasSearchableCharacter,
  parseSearchQuery,
} from '@/common/utils/search-text.util';
import {
  ContentTopicView,
  HybridSearchCursorPosition,
  RelatedContentQuery,
  HybridSearchPage,
  SearchCursorPosition,
  SearchEngine,
} from '@/modules/content/content.types';
import { ContentLengthProfile } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { SearchQueryLogService } from '@/modules/content/services/search-query-log.service';
import { SeriesService } from '@/modules/content/services/series.service';
import { COLD_START_COMPLETE_THRESHOLD } from '@/modules/drip/drip.constant';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import {
  ScoringCandidate,
  UserPreferenceWeights,
} from '@/modules/drip/drip.types';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { DripScoringService } from '@/modules/drip/services/drip-scoring.service';
import { PreferenceVectorService } from '@/modules/drip/services/preference-vector.service';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryService } from '@/modules/library/library.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';

import {
  DEFAULT_POPULAR_PERIOD,
  EXPLORE_RANKING_POOL_SIZE,
  EXPLORE_SECTION_ITEM_COUNT,
  EXPLORE_SECTION_TITLES,
  MIN_SEARCH_QUERY_LENGTH,
  SEARCH_FALLBACK_POPULAR_COUNT,
  SEARCH_FALLBACK_RELATED_TOPIC_COUNT,
  SERIES_CARD_SECTION_OVERFETCH,
} from './explore.constant';
import {
  DecodedSearchCursor,
  decodeAnySearchCursor,
  decodeExploreCursor,
  decodePopularCursor,
  decodeSearchCursor,
  encodeExploreCursor,
  encodeHybridSearchCursor,
  encodePopularCursor,
  encodeSearchCursor,
} from './explore.cursor';
import { groupBySeries } from './explore.series-grouping';
import { ExploreSectionKey, SaveReason } from './explore.enum';
import {
  ExploreContentListQuery,
  ExploreContentListResult,
  ExploreFeedResult,
  ExploreItemView,
  ExploreListItemView,
  ExplorePopularListQuery,
  ExplorePopularListResult,
  ExploreSearchFallback,
  ExploreSearchQuery,
  ExploreSearchResult,
  ExploreSectionDraft,
  ExploreSectionView,
  ExploreTopicChipView,
  SaveContentCommand,
  SaveContentResult,
  SearchMatch,
} from './explore.types';
import { QueryEmbeddingClient } from './query-embedding.client';
import { UserMarket } from '@/modules/user/user.enum';

/**
 * architecture.md 3.3 — 여러 도메인 Service를 조합하는 유스케이스라 Orchestrator를 둔다.
 * **자기 Repository·Entity를 갖지 않는다**(`onboarding` · `library-screen`과 같은 형태).
 *
 * 탐색 한 화면에 `contents` · `content_topics` · `content_stats`(content), `library_items`
 * (library), `play_records` · `user_signals`(playback), `user_interests` · `topics`
 * (interest), `drip_excluded_contents`(drip)가 함께 들어간다. 어느 한 모듈의 Entity로
 * 환원되지 않으므로 소유 모듈들 **위에서** 조합한다.
 *
 * 검색(explore-api.md 4.5)도 여기에 있다 — **MVP 포함으로 격상됐다**(합의 2026-08-23,
 * 종전 "P1 유지·검색창 비활성" 합의 2026-08-06을 폐기). 매칭·랭킹 규칙은 `explore.md`
 * 4.5-5가 소유하고 조회는 `content` 모듈이 수행하며, 이 계층은 정규화·커서·빈 결과
 * fallback 조립만 담당한다.
 */
@Injectable()
export class ExploreOrchestrator {
  constructor(
    private readonly contentService: ContentService,
    private readonly libraryService: LibraryService,
    private readonly playbackService: PlaybackService,
    private readonly userInterestService: UserInterestService,
    private readonly topicService: TopicService,
    private readonly dripExclusionService: DripExclusionService,
    private readonly preferenceVectorService: PreferenceVectorService,
    private readonly dripScoringService: DripScoringService,
    private readonly dataSource: DataSource,
    private readonly searchQueryLogService: SearchQueryLogService,
    private readonly seriesService: SeriesService,
    configService: ConfigService<EnvironmentVariables, true>,
    private readonly queryEmbeddingClient: QueryEmbeddingClient,
  ) {
    // **`true`를 명시했을 때만 켠다**(env.validation.ts) — 1.2.x 앱은 `type: "series"` 항목을 모른다. 꺼져 있으면 응답이 이 기능
    // 전과 바이트 단위로 같다(분기는 전부 이 값 하나로 갈린다)
    this.seriesCardsEnabled =
      configService
        .get('SERIES_EXPLORE_CARDS_ENABLED', { infer: true })
        ?.trim() === 'true';
  }

  /** 탐색 시리즈 카드(KAN-134 확정 설계 4번) 스위치 */
  private readonly seriesCardsEnabled: boolean;

  /**
   * explore-api.md 4.1 — 탐색 탭 진입·당겨서 새로고침·포그라운드 복귀·플레이어 복귀가
   * 모두 이 하나를 호출한다.
   *
   * **잔여 재생 표시값을 같은 응답에 얹는다**(`explore.md` 3장). 피드를 여는 시점이 곧 그
   * 값을 갱신해야 하는 시점이라, 호출을 나누면 화면과 숫자가 어긋나는 구간이 생긴다.
   */
  async getFeed(
    userId: string,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExploreFeedResult> {
    // 취향은 **읽기만 한다** — 신호 재집계는 편성 배치가 하루 한 번 수행하고 피드는 그
    // 결과(`user_preference_vectors`)를 읽는다(domain.md 7.2). 콜드스타트 판정에 쓰는
    // 완청 수도 같은 행에서 온다 — 판정과 가중치가 같은 스냅샷이어야 "콜드스타트는 벗어났는데
    // 가중치는 비어 있는" 중간 상태가 생기지 않는다
    const [activeTopicIds, preference] = await Promise.all([
      this.userInterestService.findActiveTopicIds(userId),
      this.preferenceVectorService.findWeights(userId),
    ]);

    const isColdStart =
      (preference?.signalCount ?? 0) < COLD_START_COMPLETE_THRESHOLD;
    // 관심사(개인 적합도로 다시 줄 세움)·주제별 섹션은 후보 조회가 대표 편을 고를 수 없어(재정렬이 SQL 밖이다) 시리즈 카드
    // 모드면 넉넉히 읽어 메모리에서 접는다. 인기·새로 나온 섹션은 SQL이 접는다. 꺼져 있으면 종전 그대로 10건이다
    const sectionLimit = this.seriesCardsEnabled
      ? EXPLORE_SECTION_ITEM_COUNT * SERIES_CARD_SECTION_OVERFETCH
      : EXPLORE_SECTION_ITEM_COUNT;

    const [interestContents, recentContents, popularPage, topicGroups] =
      await Promise.all([
        this.findInterestContents(
          activeTopicIds,
          preference,
          isColdStart,
          now,
          market,
          lengthProfile,
          sectionLimit,
        ),
        // 시리즈 카드 모드는 SQL이 시리즈마다 대표 편 하나만 남긴다 — 접은 뒤에도 10칸이 찬다
        this.seriesCardsEnabled
          ? this.contentService.findRecent(
              EXPLORE_SECTION_ITEM_COUNT,
              now,
              market,
              lengthProfile,
              undefined,
              true,
            )
          : this.contentService.findRecent(
              EXPLORE_SECTION_ITEM_COUNT,
              now,
              market,
              lengthProfile,
            ),
        // 피드는 **기본 구간**으로만 만든다. 구간을 바꾸면 피드를 다시 부르지 않고
        // `getPopular`가 그 섹션만 갈아끼운다(`explore.md` 4.1-1)
        this.contentService.findPopularPage({
          market,
          lengthProfile,
          periodType: DEFAULT_POPULAR_PERIOD,
          cursor: null,
          limit: EXPLORE_SECTION_ITEM_COUNT,
          now,
          ...this.seriesAnchorsQuery(),
        }),
        this.findTopicGroupDrafts(
          activeTopicIds,
          now,
          market,
          lengthProfile,
          sectionLimit,
        ),
      ]);

    const interest: ExploreSectionDraft = {
      key: ExploreSectionKey.INTEREST,
      title: EXPLORE_SECTION_TITLES[ExploreSectionKey.INTEREST],
      topic: null,
      period: null,
      contents: interestContents,
    };
    const recent: ExploreSectionDraft = {
      key: ExploreSectionKey.NEW,
      title: EXPLORE_SECTION_TITLES[ExploreSectionKey.NEW],
      topic: null,
      period: null,
      contents: recentContents,
    };
    const popular: ExploreSectionDraft = {
      key: ExploreSectionKey.POPULAR,
      title: EXPLORE_SECTION_TITLES[ExploreSectionKey.POPULAR],
      topic: null,
      // 어느 구간으로 만들었는지 알려야 클라이언트가 토글의 선택 상태를 그린다
      period: DEFAULT_POPULAR_PERIOD,
      contents: popularPage.items.map((ranked) => ranked.content),
    };

    // **인기 섹션을 맨 앞에 둔다**(확정 2026-09-02) — 화면에서 가장 큰 카드로 그려지는 줄이라
    // 중간에 있으면 스크롤을 내려야 만난다. 신호가 부족한 신규 사용자는 그 다음에도
    // **신규 섹션 비중을 높인다**(콜드스타트 — FR-17).
    // 클라이언트는 내려온 순서대로 그릴 뿐이다
    const ordered = isColdStart
      ? [popular, recent, interest, ...topicGroups]
      : [popular, interest, recent, ...topicGroups];
    // 섹션마다 같은 시리즈 편을 카드 하나로 접는다 — 섹션 사이에서는 접지 않는다(콘텐츠도 섹션마다 겹쳐 나온다)
    const drafts = this.seriesCardsEnabled
      ? ordered.map((draft) => ({
          ...draft,
          contents: groupBySeries(draft.contents, EXPLORE_SECTION_ITEM_COUNT),
        }))
      : ordered;

    const [sections, quota] = await Promise.all([
      // 비어 있는 섹션은 내려주지 않는다 — 제목만 있고 아무것도 없는 줄을 그리게 된다.
      // 전부 비면 `sections: []`이고, 클라이언트는 빈 피드 화면을 그린다(404가 아니다)
      this.toSectionViews(
        userId,
        drafts.filter((draft) => draft.contents.length > 0),
        now,
        market,
        lengthProfile,
      ),
      this.playbackService.buildQuotaForUser(userId, now),
    ]);

    return { sections, quota };
  }

  /**
   * explore-api.md 4.2 — 주제 필터를 걸었을 때의 단일 목록.
   *
   * **정렬은 추천 랭킹 순(서버 계산)이며 정렬 파라미터를 두지 않는다** — 탐색 목록은 발견
   * 화면이지 관리 화면이 아니다.
   *
   * 여기서는 피드의 관심사 섹션과 달리 **신호 기반 재정렬을 얹지 않는다.** 재정렬은 읽어 온
   * 후보 안에서만 순서를 바꾸는데(`explore.ranking`), 커서 페이지네이션은 정렬 키가 SQL에
   * 그대로 표현돼야 페이지 경계가 어긋나지 않는다. 목록은 이미 선택한 주제로 좁혀져 있어
   * 주제 가중치가 더할 정보도 거의 없다.
   */
  async getContents(
    userId: string,
    query: ExploreContentListQuery,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExploreContentListResult> {
    const page = await this.contentService.findExplorePage({
      market,
      lengthProfile,
      topicIds: query.topicIds,
      cursor: query.cursor
        ? decodeExploreCursor(query.cursor, query.topicIds)
        : null,
      limit: query.limit,
      now,
      ...this.seriesAnchorsQuery(),
    });

    const [items, quota] = await Promise.all([
      this.toListItems(
        userId,
        page.items.map((ranked) => ranked.content),
        now,
        market,
        lengthProfile,
      ),
      this.playbackService.buildQuotaForUser(userId, now),
    ]);

    const lastItem = page.items.at(-1);

    return {
      items,
      // `has_next`가 false면 커서를 발급하지 않는다 — 끝인지 아닌지를 두 값이 말하면 어긋난다
      nextCursor:
        page.hasNext && lastItem
          ? encodeExploreCursor(
              {
                playCount: lastItem.playCount,
                publishedAt: lastItem.content.publishedAt,
                id: lastItem.content.id,
              },
              query.topicIds,
            )
          : null,
      hasNext: page.hasNext,
      quota,
    };
  }

  /**
   * player-api.md 4.8 — 관련 콘텐츠(KAN-240). 코사인 조회·기준 편 판정(404)은 `ContentService`가 하고, 여기서는
   * **탐색 행과 같은 조립**(`decorate` — 라이브러리 상태·오늘 카운트·주제·시리즈 표시)만 얹는다. 시리즈 카드 스위치와 무관하게
   * 편 행이다(`decorateGrouped`를 쓰지 않는다 — 추천 블록은 편 단위 목록이다).
   */
  async getRelated(
    userId: string,
    query: RelatedContentQuery,
  ): Promise<ExploreItemView[]> {
    const contents = await this.contentService.findRelatedContents(query);

    return this.decorate(userId, contents, query.now);
  }

  /**
   * explore-api.md 4.2-1 — 인기 콘텐츠의 구간을 바꿨을 때의 단일 목록.
   *
   * **피드를 다시 부르지 않는다.** 구간만 바뀌었는데 관심사 섹션의 소비 신호 랭킹까지
   * 재계산될 이유가 없다(`explore.md` 4.1-1).
   *
   * **요청 구간을 응답에 되돌린다.** 미전송 시 서버가 채운 기본값을 클라이언트가 알아야
   * 토글의 선택 상태를 그릴 수 있고, 기본값을 양쪽에 두면 서버가 그것을 바꿀 때 어긋난다.
   */
  async getPopular(
    userId: string,
    query: ExplorePopularListQuery,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExplorePopularListResult> {
    const page = await this.contentService.findPopularPage({
      market,
      lengthProfile,
      periodType: query.period,
      cursor: query.cursor
        ? decodePopularCursor(query.cursor, query.period)
        : null,
      limit: query.limit,
      now,
      ...this.seriesAnchorsQuery(),
    });

    const [items, quota] = await Promise.all([
      this.toListItems(
        userId,
        page.items.map((ranked) => ranked.content),
        now,
        market,
        lengthProfile,
      ),
      this.playbackService.buildQuotaForUser(userId, now),
    ]);

    const lastItem = page.items.at(-1);

    return {
      period: query.period,
      items,
      nextCursor:
        page.hasNext && lastItem
          ? encodePopularCursor(
              {
                playCount: lastItem.playCount,
                completeCount: lastItem.completeCount,
                publishedAt: lastItem.content.publishedAt,
                id: lastItem.content.id,
              },
              query.period,
            )
          : null,
      hasNext: page.hasNext,
      quota,
    };
  }

  /**
   * explore-api.md 4.2-2 — 주제 칩 줄.
   *
   * **관심 주제를 앞쪽에 선택한 순서로, 나머지 노출 주제를 뒤에 `display_order` 순으로** 둔다
   * (`explore.md` 4.2). 정렬을 서버가 소유하는 이유는 규칙이 두 곳에 생기면 화면마다 칩
   * 순서가 달라지기 때문이다.
   *
   * **숨겨진 주제(`is_visible = false`)는 관심 주제여도 노출하지 않는다**(팀 결정 2026-08-11 —
   * 숨김 주제는 모든 사용자에게서 제거된다. 합의 2026-08-07의 보유자 예외를 뒤집었다).
   * 필터는 `UserInterestService.findAllActive`가 한다 — 노출면마다 기준이 갈라지지 않는다.
   *
   * 두 목록을 합쳐 정렬하는 것은 **탐색 화면의 규칙**이라 `interest` 모듈이 아니라 여기서 한다.
   */
  async getTopicChips(
    userId: string,
    market: UserMarket,
  ): Promise<ExploreTopicChipView[]> {
    // `findAllActive`가 이미 `created_at` 오름차순이라 이 순서가 곧 사용자가 고른 순서다
    const interests = await this.userInterestService.findAllActive(userId);
    const interestTopicIds = interests.map((interest) => interest.topicId);

    const [interestTopics, visibleTopics] = await Promise.all([
      this.topicService.findAllByIds(interestTopicIds),
      this.topicService.findAllVisible(market),
    ]);

    const interestTopicById = new Map(
      interestTopics.map((topic) => [topic.id, topic]),
    );
    const interestTopicIdSet = new Set(interestTopicIds);

    const chips: ExploreTopicChipView[] = [];

    for (const topicId of interestTopicIds) {
      const topic = interestTopicById.get(topicId);

      // 관심 주제의 `topic_id`는 FK라 정상 상태에서는 비지 않는다. 방어적으로 건너뛴다
      if (topic) {
        chips.push({ id: topic.id, name: topic.name, isInterest: true });
      }
    }

    for (const topic of visibleTopics) {
      if (!interestTopicIdSet.has(topic.id)) {
        chips.push({ id: topic.id, name: topic.name, isInterest: false });
      }
    }

    // 노출할 주제가 하나도 없으면 빈 배열이다. **404가 아니다** —
    // 그때는 피드도 비어 클라이언트가 칩 줄 자체를 숨긴다
    return chips;
  }

  /**
   * explore-api.md 4.5 — 검색(FR-22). 300ms 디바운스 자동 검색과 키보드 [검색] 제출이 같은 것을 호출한다.
   *
   * **정규화(NFC·소문자)는 여기서 한 번만 한다** — 조회(`content`)와 커서 지문이 같은 문자열을 봐야 하고, 규칙이 두 곳에
   * 생기면 매칭 결과가 갈라진다(`explore.md` 4.5-5). **정규화 후 길이를 재검증한다** — NFD 분해형("커" = ㅋ+ㅓ 2 코드포인트)은
   * NFC 합성 후 1자가 된다(explore-api.md 4.5).
   *
   * 흐름(KAN-238 — `explore.md` 4.5-5):
   * 1. `#`으로 시작하면 **종전 태그 정확 일치 경로**(KAN-218) — 교정·의미 엔진 없음, `exact` 무시, 종전 커서.
   * 2. 하이브리드(키워드 + 의미, RRF) — 질의 임베딩은 AI 서버(`QueryEmbeddingClient`, 결손이면 키워드만).
   * 3. `exact`가 아니고 **키워드 엔진 0건**이면 교정어를 찾는다 — 교정어가 있고 **교정어로 키워드 1건 이상**이면 교정어로
   *    2를 다시 돌려 그 결과를 낸다(`query_used` = 교정어, `corrected_from` = 입력). 아니면 원문 결과 그대로.
   * 4. 두 엔진 0건이면 종전 빈 결과 `fallback`. 시리즈 카드 접기·회수·시장 제외는 조회 조건 그대로다.
   *
   * 커서 페이지는 커서가 실어 온 검색 상태(교정어·`match`·의미 엔진 사용)로 잇고 교정을 다시 판정하지 않는다.
   * **종전 커서**(배포 순간 옛 앱이 들고 있던 것)는 종전 키워드 경로로 잇는다 — 오류 없이 다음 페이지가 나온다.
   *
   * 응답은 **덧붙이는 필드만** 늘었다(`query_used`·`corrected_from`·`match`·`engines`·`items[].matched_by`) — 옛 앱(1.1.0~1.3.0)은
   * 모르는 필드를 무시하고 결과를 일반 결과처럼 그린다.
   */
  async search(
    userId: string,
    query: ExploreSearchQuery,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExploreSearchResult> {
    const { normalizedQuery, term, tagOnly } = parseSearchQuery(query.query);

    if (
      term.length < MIN_SEARCH_QUERY_LENGTH ||
      !hasSearchableCharacter(term)
    ) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '검색어를 확인해주세요',
        logLevel: 'info',
      });
    }

    if (tagOnly) {
      return this.searchKeywordOnly(userId, query, now, market, lengthProfile, {
        normalizedQuery,
        term,
        tagOnly: true,
        cursor: query.cursor
          ? decodeSearchCursor(query.cursor, normalizedQuery, query.topicIds)
          : null,
      });
    }

    // 빈 커서(`cursor=`)도 첫 페이지다 — 세 판정(디코드·검색 로그·대체 콘텐츠)이 같은 기준을 써야 한다(2026-10-13)
    if (query.cursor) {
      const decoded = decodeAnySearchCursor(
        query.cursor,
        normalizedQuery,
        query.topicIds,
        query.exact,
      );

      return decoded.kind === 'legacy'
        ? this.searchKeywordOnly(userId, query, now, market, lengthProfile, {
            normalizedQuery,
            term,
            tagOnly: false,
            cursor: decoded.position,
          })
        : this.searchHybridNextPage(
            userId,
            query,
            now,
            market,
            lengthProfile,
            normalizedQuery,
            decoded,
          );
    }

    return this.searchHybridFirstPage(
      userId,
      query,
      now,
      market,
      lengthProfile,
      normalizedQuery,
    );
  }

  /** 하이브리드 첫 페이지 — 교정 판정·검색 로그·빈 결과 대체 콘텐츠가 여기서만 돈다 */
  private async searchHybridFirstPage(
    userId: string,
    query: ExploreSearchQuery,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
    normalizedQuery: string,
  ): Promise<ExploreSearchResult> {
    let queryUsed = normalizedQuery;
    let run = await this.runHybrid(
      query,
      now,
      market,
      lengthProfile,
      normalizedQuery,
      true,
    );

    if (!query.exact && !run.page.keywordMatched) {
      const correction = await this.contentService.findSearchCorrection({
        market,
        lengthProfile,
        normalizedQuery,
        includeSeriesTitles: this.seriesCardsEnabled,
        now,
      });

      if (correction) {
        const corrected = await this.runHybrid(
          query,
          now,
          market,
          lengthProfile,
          correction,
          true,
        );

        // 교정어로도 키워드가 0건이면 교정하지 않는다 — "대신 검색"이 키워드 결과 없는 화면을 만들지 않게(4.5-3)
        if (corrected.page.keywordMatched) {
          queryUsed = correction;
          run = corrected;
        }
      }
    }

    const { page, engines } = run;
    const matchedBy = page.items.map((ranked) => ranked.matchedBy);
    const keywordCount = matchedBy.filter((engineList) =>
      engineList.includes('keyword'),
    ).length;
    const match: SearchMatch =
      page.items.length === 0 || keywordCount > 0 ? 'keyword' : 'related';
    const correctedFrom =
      queryUsed !== normalizedQuery ? normalizedQuery : null;

    // 첫 페이지만 남긴다 — 커서 페이지는 같은 질의의 이어 읽기라 새 검색이 아니다(domain.md 5.7).
    // 디바운스 중간 입력은 서비스가 직전 행에 덮어쓰고, 적재 실패도 거기서 삼켜져 응답에는 영향이 없다
    await this.searchQueryLogService.record(
      {
        userId,
        normalizedQuery,
        queryUsed,
        resultCount: page.items.length,
        keywordCount,
        engines,
        exact: query.exact,
        hasNext: page.hasNext,
        topicFilterCount: query.topicIds.length,
        resultContentIds: page.items.map((ranked) => ranked.content.id),
      },
      now,
    );

    const lastItem = page.items.at(-1);

    return {
      items: await this.toListItems(
        userId,
        page.items.map((ranked) => ranked.content),
        now,
        market,
        lengthProfile,
      ),
      matchedBy,
      queryUsed,
      correctedFrom,
      match,
      engines,
      nextCursor:
        page.hasNext && lastItem
          ? encodeHybridSearchCursor(
              lastItem.position,
              {
                queryUsed,
                corrected: correctedFrom !== null,
                match,
                semantic: engines.includes('semantic'),
              },
              normalizedQuery,
              query.topicIds,
              query.exact,
            )
          : null,
      hasNext: page.hasNext,
      // **첫 페이지의 빈 결과에만 대체 콘텐츠를 조립한다** — 관련 주제는 입력(원문)으로 찾는다
      fallback:
        page.items.length === 0
          ? await this.buildSearchFallback(
              userId,
              normalizedQuery,
              now,
              market,
              lengthProfile,
            )
          : null,
    };
  }

  /** 하이브리드 커서 페이지 — 커서의 검색 상태(교정어·`match`·의미 엔진 사용)로 같은 검색을 잇는다 */
  private async searchHybridNextPage(
    userId: string,
    query: ExploreSearchQuery,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
    normalizedQuery: string,
    decoded: Extract<DecodedSearchCursor, { kind: 'hybrid' }>,
  ): Promise<ExploreSearchResult> {
    const { state, position } = decoded;
    const { page, engines } = await this.runHybrid(
      query,
      now,
      market,
      lengthProfile,
      state.queryUsed,
      state.semantic,
      position,
    );
    const lastItem = page.items.at(-1);

    return {
      items: await this.toListItems(
        userId,
        page.items.map((ranked) => ranked.content),
        now,
        market,
        lengthProfile,
      ),
      matchedBy: page.items.map((ranked) => ranked.matchedBy),
      queryUsed: state.queryUsed,
      correctedFrom: state.corrected ? normalizedQuery : null,
      match: state.match,
      engines,
      nextCursor:
        page.hasNext && lastItem
          ? encodeHybridSearchCursor(
              lastItem.position,
              // 이번 페이지에서 결손이었어도 첫 페이지 상태(`semantic`)를 그대로 넘긴다 — 다음 페이지는 다시 시도한다
              state,
              normalizedQuery,
              query.topicIds,
              query.exact,
            )
          : null,
      hasNext: page.hasNext,
      // 커서 페이지의 빈 응답은 "결과 없음" 화면이 아니라 목록의 끝이다(explore-api.md 4.5)
      fallback: null,
    };
  }

  /**
   * 하이브리드 한 번 — 질의 임베딩(`useSemantic`이면 AI 서버, 캐시)을 받아 두 엔진을 돌린다. 임베딩이 결손이면 키워드만이고
   * `engines`에 `semantic`이 없다
   */
  private async runHybrid(
    query: ExploreSearchQuery,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
    queryUsed: string,
    useSemantic: boolean,
    cursor: HybridSearchCursorPosition | null = null,
  ): Promise<{ page: HybridSearchPage; engines: SearchEngine[] }> {
    const queryVector = useSemantic
      ? await this.queryEmbeddingClient.embed(queryUsed)
      : null;
    const page = await this.contentService.findHybridSearchPage({
      market,
      lengthProfile,
      normalizedQuery: queryUsed,
      queryVector,
      topicIds: query.topicIds,
      cursor,
      limit: query.limit,
      now,
      // 시리즈 카드 모드는 시리즈 제목 일치도 묻는다(KAN-134 확정 설계 4번)
      ...(this.seriesCardsEnabled && { matchSeriesTitle: true }),
      ...this.seriesAnchorsQuery(),
    });

    return {
      page,
      engines: queryVector ? ['keyword', 'semantic'] : ['keyword'],
    };
  }

  /**
   * 종전 키워드 전용 경로 — `#` 태그 정확 일치(KAN-218)와 **종전 커서의 이어 읽기**가 쓴다. 매칭·정렬·커서 모양이 KAN-238 전과
   * 같고, 덧붙인 응답 필드는 고정값이다(`query_used` = 입력, 교정 없음, `match: "keyword"`, `engines: ["keyword"]`).
   *
   * `#` 질의는 앞의 `#` 하나를 뗀 검색어(`term`)로 매칭·관련 주제를 찾고, 커서 지문·검색 로그는 `#`을 남긴 원문으로 한다 —
   * 태그 검색과 부분 일치 검색의 커서가 섞이지 않고, 로그로 태그 검색 비율을 셀 수 있다.
   */
  private async searchKeywordOnly(
    userId: string,
    query: ExploreSearchQuery,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
    keyword: {
      normalizedQuery: string;
      term: string;
      tagOnly: boolean;
      cursor: SearchCursorPosition | null;
    },
  ): Promise<ExploreSearchResult> {
    const { normalizedQuery, term, tagOnly, cursor } = keyword;
    const isFirstPage = cursor === null;

    const page = await this.contentService.findSearchPage({
      market,
      lengthProfile,
      normalizedQuery: term,
      tagOnly,
      topicIds: query.topicIds,
      cursor,
      limit: query.limit,
      now,
      // 시리즈 카드 모드는 시리즈 제목 일치도 묻는다(KAN-134 확정 설계 4번)
      ...(this.seriesCardsEnabled && { matchSeriesTitle: true }),
      ...this.seriesAnchorsQuery(),
    });

    if (isFirstPage) {
      await this.searchQueryLogService.record(
        {
          userId,
          normalizedQuery,
          queryUsed: normalizedQuery,
          resultCount: page.items.length,
          keywordCount: page.items.length,
          engines: ['keyword'],
          exact: false,
          hasNext: page.hasNext,
          topicFilterCount: query.topicIds.length,
          resultContentIds: page.items.map((ranked) => ranked.content.id),
        },
        now,
      );
    }

    const fixed = {
      queryUsed: normalizedQuery,
      correctedFrom: null,
      match: 'keyword' as const,
      engines: ['keyword' as const],
    };

    if (page.items.length === 0) {
      return {
        items: [],
        matchedBy: [],
        ...fixed,
        nextCursor: null,
        hasNext: false,
        // **첫 페이지의 빈 결과에만 대체 콘텐츠를 조립한다.** 커서 페이지의 빈 응답은
        // "결과 없음" 화면이 아니라 목록의 끝이다(explore-api.md 4.5)
        fallback: isFirstPage
          ? await this.buildSearchFallback(
              userId,
              term,
              now,
              market,
              lengthProfile,
            )
          : null,
      };
    }

    const items = await this.toListItems(
      userId,
      page.items.map((ranked) => ranked.content),
      now,
      market,
      lengthProfile,
    );
    const lastItem = page.items.at(-1);

    return {
      items,
      matchedBy: page.items.map((): SearchEngine[] => ['keyword']),
      ...fixed,
      nextCursor:
        page.hasNext && lastItem
          ? encodeSearchCursor(
              {
                score: lastItem.score,
                titleSimilarity: lastItem.titleSimilarity,
                playCount: lastItem.playCount,
                publishedAt: lastItem.content.publishedAt,
                id: lastItem.content.id,
              },
              normalizedQuery,
              query.topicIds,
            )
          : null,
      hasNext: page.hasNext,
      fallback: null,
    };
  }

  /**
   * 빈 결과의 대체 콘텐츠(`explore.md` 4.5-3 — 초기 콘텐츠 풀이 작아 빈 결과 UX가 중요하다).
   * 관련 주제 칩과 인기 콘텐츠를 **같은 응답에** 싣는다 — 별도 호출로 나누면 빈 화면이
   * 한 박자 늦게 채워진다. 인기 목록은 기본 구간(월간)의 상위를 그대로 쓴다.
   */
  private async buildSearchFallback(
    userId: string,
    normalizedQuery: string,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExploreSearchFallback> {
    const [relatedTopics, popularPage] = await Promise.all([
      this.topicService.findVisibleRelatedByName(
        normalizedQuery,
        SEARCH_FALLBACK_RELATED_TOPIC_COUNT,
        market,
      ),
      this.contentService.findPopularPage({
        market,
        lengthProfile,
        periodType: DEFAULT_POPULAR_PERIOD,
        cursor: null,
        limit: SEARCH_FALLBACK_POPULAR_COUNT,
        now,
        ...this.seriesAnchorsQuery(),
      }),
    ]);

    return {
      relatedTopics: relatedTopics.map((topic) => ({
        id: topic.id,
        name: topic.name,
      })),
      popularItems: await this.toListItems(
        userId,
        popularPage.items.map((ranked) => ranked.content),
        now,
        market,
        lengthProfile,
      ),
    };
  }

  // ── 탐색 시리즈 카드(KAN-134 확정 설계 4번 — `SERIES_EXPLORE_CARDS_ENABLED`) ──────────────────────────

  /**
   * 목록 조회에 얹는 "시리즈 대표 편만" 조건 — 꺼져 있으면 **아무 키도 더하지 않는다**(조회 입력이 종전과 같다).
   * 대표 편 판정은 SQL 윈도가 한다(`ContentRepository.applySeriesAnchors`) — 페이지·커서는 종전 키셋 그대로다
   */
  private seriesAnchorsQuery(): { seriesAnchorsOnly?: true } {
    return this.seriesCardsEnabled ? { seriesAnchorsOnly: true } : {};
  }

  /** 목록 항목 — 꺼져 있으면 종전 행(`decorate`), 켜져 있으면 대표 편을 카드로 바꾼다(`decorateGrouped`) */
  private async toListItems(
    userId: string,
    contents: Content[],
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExploreListItemView[]> {
    return this.seriesCardsEnabled
      ? this.decorateGrouped(userId, contents, now, market, lengthProfile)
      : this.decorate(userId, contents, now);
  }

  // ── 탐색 시리즈 카드(KAN-134 확정 설계 4번 — `SERIES_EXPLORE_CARDS_ENABLED`) ──────────────────────────

  /**
   * 이미 접힌 목록(시리즈 편은 카드 자리 하나뿐)을 항목으로 만든다 — 시리즈 편은 카드(`type: "series"`), 나머지는 콘텐츠 행
   * (`type: "content"`). 카드 재료(표지·편 수·주제)는 시리즈 단위로 한 번에 읽는다. 사용자 시장에 노출 편이 없어 카드를 못 만든
   * 시리즈(정상 상태에서는 없다 — 그 편 자체가 노출 중이다)는 편 행으로 둔다
   */
  private async decorateGrouped(
    userId: string,
    contents: Content[],
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExploreListItemView[]> {
    const cards = await this.seriesService.findCards(
      contents
        .map((content) => content.seriesId)
        .filter((seriesId) => typeof seriesId === 'string'),
      now,
      market,
      lengthProfile,
    );
    const cardOf = (content: Content) =>
      typeof content.seriesId === 'string'
        ? cards.get(content.seriesId)
        : undefined;
    const isCard = (content: Content) => cardOf(content) !== undefined;
    const decorated = await this.decorate(
      userId,
      contents.filter((content) => !isCard(content)),
      now,
    );
    const viewById = new Map(decorated.map((view) => [view.content.id, view]));

    // 입력과 1:1이다(`decorate`가 콘텐츠마다 한 행을 만든다) — 섹션 조립이 같은 자리로 되짚는다
    return contents.map((content): ExploreListItemView => {
      const card = cardOf(content);
      if (card) {
        return { type: 'series', card };
      }
      return {
        ...(viewById.get(content.id) as ExploreItemView),
        type: 'content',
      };
    });
  }

  /**
   * explore-api.md 4.3 — 담기. **횟수 제한이 없고 페이월을 노출하지 않는다**(PRD 5.4).
   *
   * 서버 처리를 하나의 트랜잭션으로 묶는다(architecture.md 8.1). 라이브러리 행과 신호가
   * 따로 커밋되면 신호만 남은 담기가 생긴다.
   */
  async saveContent(command: SaveContentCommand): Promise<SaveContentResult> {
    return this.dataSource.transaction(async (manager) => {
      // 회수 여부는 피드에서 걸러도 이미 화면에 떠 있는 행이 탭될 수 있다
      await this.contentService.getPublishedById(
        command.contentId,
        manager,
        command.now,
        command.market,
      );

      const saved = await this.libraryService.save(
        command.userId,
        command.contentId,
        command.now,
        manager,
      );

      // **자동 적립은 신호를 남기지 않는다**(explore-api.md 4.3) — 사용자의 "담기" 의사가
      // 아니라서 `save`로 적재하면 추천 입력이 왜곡된다.
      //
      // **라이브러리 상태가 바뀐 경우에만 남긴다.** `user_signals`는 중복을 막는 제약이 없는
      // 이력 테이블이라(domain.md 6.4), 이미 담긴 콘텐츠에 오프라인 큐가 같은 담기를
      // 재전송하면 행은 그대로인데 신호만 쌓여 그 주제의 가중치가 부풀려진다. 라이브러리
      // 삭제(`library-api.md` 4.6)·담기 해제(4.4)가 같은 이유로 이미 no-op 신호를 막고 있다.
      const isLibraryChanged = saved.created || saved.reactivated;

      if (command.reason === SaveReason.USER_SAVE && isLibraryChanged) {
        await this.playbackService.recordSignal(
          command.userId,
          command.contentId,
          UserSignalAction.SAVE,
          manager,
        );
      }

      const quota = await this.playbackService.buildQuotaForUser(
        command.userId,
        command.now,
        manager,
      );

      return { item: saved.item, created: saved.created, quota };
    });
  }

  /**
   * explore-api.md 4.4 — 담기 해제. **라이브러리 삭제와 동일한 결과**를 만든다(FR-16).
   *
   * **회수된 콘텐츠도 해제할 수 있다.** 이 경로는 존재 여부만 확인하며(`getById`), 회수를
   * 이유로 막으면 사용자는 목록에 남은 항목을 영영 치울 수 없다 — 그래서 이 엔드포인트의
   * 에러는 `CONTENT_NOT_FOUND` 하나뿐이다.
   *
   * **영구 제외 사실을 응답으로 알리지 않는다**(`library.md` 4.5와 같은 이유 — 가벼운 조작에
   * 무거운 고지를 붙이지 않는다).
   */
  async unsaveContent(
    userId: string,
    contentId: string,
    now: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.contentService.getById(contentId, manager);

      const removed = await this.libraryService.unsave(
        userId,
        contentId,
        now,
        manager,
      );

      // **해제할 대상이 없으면 여기서 끝난다.** 오프라인 큐가 같은 해제를 다시 보낼 수
      // 있는데, 없던 담기의 해제로 영구 제외와 부정 신호가 쌓이면 안 된다
      if (!removed) {
        return;
      }

      await this.dripExclusionService.exclude(
        userId,
        contentId,
        DripExclusionReason.UNSAVE,
        now,
        manager,
      );

      await this.playbackService.recordSignal(
        userId,
        contentId,
        UserSignalAction.UNSAVE,
        manager,
      );
    });
  }

  /**
   * 관심사 섹션의 후보(`explore.md` 4.1).
   *
   * **관심 주제 0개 상태는 생기지 않는다** — 관심사 관리가 최소 1개 선택을 강제한다
   * (합의 2026-08-06). 그래도 빈 배열을 돌려주는 것은 방어이며, 섹션이 통째로 빠질 뿐
   * 나머지 피드는 그대로 나간다.
   */
  private async findInterestContents(
    activeTopicIds: string[],
    preference: UserPreferenceWeights | null,
    isColdStart: boolean,
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
    sectionLimit: number,
  ): Promise<Content[]> {
    if (activeTopicIds.length === 0) {
      return [];
    }

    const pool = await this.contentService.findCandidates({
      market,
      lengthProfile,
      includeTopicIds: activeTopicIds,
      limit: EXPLORE_RANKING_POOL_SIZE,
      now,
    });

    // 콜드스타트에서는 신호 기반 항목을 사실상 0으로 둔다(`drip-scheduling.md` 4.4).
    // 후보는 이미 인기·신선도 순이므로 그대로 자르는 것이 그 규칙의 적용이다.
    // **캐시 행이 없는 사용자(가입 직후·첫 배치 이전)도 여기로 들어온다** —
    // `signalCount`를 0으로 읽으므로 별도 폴백이 필요 없다
    if (isColdStart || pool.length === 0) {
      return pool.slice(0, sectionLimit);
    }

    /**
     * 개인 적합도로 재정렬한다(`DripScoringService.rankByPersonalFit`) — 편성과 같은 취향 축·같은
     * 상수다. 종전에는 주제 가중치만 읽어 같은 주제의 콘텐츠가 전부 동점이었다
     * (`tickets/backend/archive/explore-ranking-uses-one-axis.md`). 후보 임베딩은 편성 배치와
     * 같은 조회(`findScorableEmbeddings`)로 읽고, 인기·완청 수는 이 랭킹이 쓰지 않으므로 읽지 않는다.
     */
    const poolIds = pool.map((content) => content.id);
    const [topicIdsByContentId, embeddingsByContentId] = await Promise.all([
      this.findTopicIdsByContentId(poolIds),
      this.contentService.findScorableEmbeddings(poolIds),
    ]);

    const candidates: ScoringCandidate[] = pool.map((content) => ({
      content,
      playCount: 0,
      completeCount: 0,
      topicIds: topicIdsByContentId.get(content.id) ?? [],
      embedding: embeddingsByContentId.get(content.id) ?? null,
    }));

    return this.dripScoringService
      .rankByPersonalFit(candidates, preference, now)
      .slice(0, sectionLimit)
      .map((candidate) => candidate.content);
  }

  /**
   * 주제별 모아보기 섹션(`explore.md` 4.1) — 사용자 관심 주제 하나당 한 섹션.
   *
   * 주제 이름을 제목으로 쓰므로 `topics`를 함께 읽는다. **없는 주제는 섹션을 만들지 않는다** —
   * `user_interests`가 FK로 묶여 있어 정상 상태에서는 발생하지 않는 방어다.
   */
  private async findTopicGroupDrafts(
    activeTopicIds: string[],
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
    sectionLimit: number,
  ): Promise<ExploreSectionDraft[]> {
    if (activeTopicIds.length === 0) {
      return [];
    }

    const topics = await this.topicService.findAllByIds(activeTopicIds);
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));

    const drafts = await Promise.all(
      activeTopicIds.map(
        async (topicId): Promise<ExploreSectionDraft | null> => {
          const topic = topicById.get(topicId);

          if (!topic) {
            return null;
          }

          const contents = await this.contentService.findCandidates({
            market,
            lengthProfile,
            includeTopicIds: [topicId],
            limit: sectionLimit,
            now,
          });

          return {
            key: ExploreSectionKey.TOPIC_GROUP,
            title: topic.name,
            topic: { id: topic.id, name: topic.name },
            period: null,
            contents,
          };
        },
      ),
    );

    return drafts.filter(
      (draft): draft is ExploreSectionDraft => draft !== null,
    );
  }

  /**
   * 섹션들에 표시값(주제·라이브러리 상태·오늘 카운트)을 붙인다.
   *
   * **섹션마다 조회하지 않는다.** 콘텐츠가 여러 섹션에 중복 등장하므로 전체를 모아 한 번에
   * 읽고 나눠 준다(architecture.md 3.4 — N+1 회피).
   */
  private async toSectionViews(
    userId: string,
    drafts: ExploreSectionDraft[],
    now: Date,
    market: UserMarket,
    lengthProfile: ContentLengthProfile,
  ): Promise<ExploreSectionView[]> {
    if (drafts.length === 0) {
      return [];
    }

    const contents = drafts.flatMap((draft) => draft.contents);

    if (this.seriesCardsEnabled) {
      // 섹션은 이미 접혀 있다(`groupBySeries`) — 시리즈 편은 섹션마다 카드 자리 하나다
      const unique = [
        ...new Map(contents.map((content) => [content.id, content])).values(),
      ];
      const decoratedGrouped = await this.decorateGrouped(
        userId,
        unique,
        now,
        market,
        lengthProfile,
      );
      const groupedByContentId = new Map(
        unique.map((content, index) => [content.id, decoratedGrouped[index]]),
      );

      return drafts.map((draft) => ({
        key: draft.key,
        title: draft.title,
        topic: draft.topic,
        period: draft.period,
        items: draft.contents
          .map((content) => groupedByContentId.get(content.id))
          .filter((item): item is ExploreListItemView => item !== undefined),
      }));
    }
    const decorated = await this.decorate(userId, contents, now);
    const itemByContentId = new Map(
      decorated.map((item) => [item.content.id, item]),
    );

    return drafts.map((draft) => ({
      key: draft.key,
      title: draft.title,
      topic: draft.topic,
      period: draft.period,
      items: draft.contents
        .map((content) => itemByContentId.get(content.id))
        .filter((item): item is ExploreItemView => item !== undefined),
    }));
  }

  /**
   * 콘텐츠 목록에 주제·라이브러리 상태·오늘 카운트를 붙인다.
   *
   * **담김 여부는 노출·순서에 어떤 영향도 주지 않는다**(`explore.md` 4.1) — 이미 담긴
   * 콘텐츠도 전부 내려준다. 초기 콘텐츠 풀이 작아 제외하면 피드가 빈다.
   */
  private async decorate(
    userId: string,
    contents: Content[],
    now: Date,
    manager?: EntityManager,
  ): Promise<ExploreItemView[]> {
    if (contents.length === 0) {
      return [];
    }

    // 같은 콘텐츠가 여러 섹션에 걸쳐 있으므로 중복을 제거하고 조회한다
    const contentIds = [...new Set(contents.map((content) => content.id))];

    const [
      topicViews,
      libraryItems,
      countedContentIds,
      seriesRefs,
      completedIds,
    ] = await Promise.all([
      this.contentService.findTopicViews(contentIds, manager),
      this.libraryService.findActiveItems(userId, contentIds, manager),
      this.playbackService.findCountedContentIds(userId, now, manager),
      // 카드의 시리즈 표시(KAN-134) — 시리즈 행을 한 번에 읽는다. 묶음 카드(type: series)는 아직 없다
      this.seriesService.findRefs(contents, manager),
      // 완청 표시(KAN-248) — 담지 않고 끝까지 들은 편도 완청이다
      this.libraryService.findCompletedContentIds(userId, contentIds, manager),
    ]);

    const topicIdsByContentId = groupTopicIds(topicViews);
    const libraryItemByContentId = new Map<string, LibraryItem>(
      libraryItems.map((item) => [item.contentId, item]),
    );

    return contents.map((content) => {
      const libraryItem = libraryItemByContentId.get(content.id);

      return {
        content: {
          id: content.id,
          title: content.title,
          authorName: content.authorName,
          sourceName: content.sourceName,
          sourceUrl: content.sourceUrl,
          durationSec: content.durationSec,
          thumbnailUrl: content.thumbnailUrl,
          language: content.language,
          contentVersion: content.contentVersion,
          topicIds: topicIdsByContentId.get(content.id) ?? [],
          tags: content.tags ?? [],
          series: seriesRefs.get(content.id) ?? null,
        },
        library: libraryItem
          ? {
              itemId: libraryItem.id,
              source: libraryItem.source,
              status: libraryItem.status,
            }
          : null,
        isCompleted: completedIds.has(content.id),
        isCountedToday: countedContentIds.has(content.id),
      };
    });
  }

  /** 랭킹 입력용 — `content_id`별 주제 목록 */
  private async findTopicIdsByContentId(
    contentIds: string[],
  ): Promise<Map<string, string[]>> {
    return groupTopicIds(
      await this.contentService.findTopicViews([...new Set(contentIds)]),
    );
  }
}

function groupTopicIds(views: ContentTopicView[]): Map<string, string[]> {
  const byContentId = new Map<string, string[]>();

  for (const view of views) {
    const topicIds = byContentId.get(view.contentId) ?? [];
    topicIds.push(view.topicId);
    byContentId.set(view.contentId, topicIds);
  }

  return byContentId;
}
