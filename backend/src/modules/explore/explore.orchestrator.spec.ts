import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { EnvironmentVariables } from '@/config/env.validation';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentStatus, StatsPeriodType } from '@/modules/content/content.enum';
import {
  RankedPopularContent,
  RrfSearchCursorPosition,
  SearchEngine,
} from '@/modules/content/content.types';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { SearchQueryLogService } from '@/modules/content/services/search-query-log.service';
import { SeriesService } from '@/modules/content/services/series.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { UserPreferenceWeights } from '@/modules/drip/drip.types';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { DripScoringService } from '@/modules/drip/services/drip-scoring.service';
import { PreferenceVectorService } from '@/modules/drip/services/preference-vector.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';

import {
  decodeAnySearchCursor,
  decodeExploreCursor,
  decodePopularCursor,
  decodeSearchCursor,
  encodeHybridSearchCursor,
  encodePopularCursor,
  encodeSearchCursor,
} from './explore.cursor';
import { ExploreSectionKey, SaveReason } from './explore.enum';
import { ExploreOrchestrator } from './explore.orchestrator';
import {
  ExploreItemView,
  ExploreListItemView,
  ExploreSearchQuery,
} from './explore.types';
import { QueryEmbeddingClient } from './query-embedding.client';
import { UserMarket } from '@/modules/user/user.enum';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const OTHER_CONTENT_ID = 'bbbbbbbb-1111-4111-8111-111111111111';
const TOPIC_ID = 'cccccccc-1111-4111-8111-111111111111';

const QUOTA = {
  dailyPlayLimit: 2,
  dailyPlayCount: 1,
  serviceDate: '2026-08-05',
};

function buildContent(id: string, overrides: Partial<Content> = {}): Content {
  return {
    id,
    title: '번아웃 없이 오래 일하는 법',
    authorName: '김서연',
    sourceName: '폴인',
    durationSec: 620,
    thumbnailUrl: 'https://example.com/thumb.png',
    contentVersion: 1,
    status: ContentStatus.PUBLISHED,
    publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  } as Content;
}

/** 하이브리드 행의 RRF 커서 위치 — `buildContent`의 `published_at`과 같다 */
function rrfPosition(
  id: string,
  rrf: number,
  playCount: number,
): RrfSearchCursorPosition {
  return {
    order: 'rrf',
    rrf,
    playCount,
    publishedAt: new Date('2026-08-01T00:00:00.000Z'),
    id,
  };
}

/** 인기 목록은 커서 발급 때문에 정렬 키를 함께 돌려준다 */
function buildPopularRow(
  id: string,
  playCount = 0,
  completeCount = 0,
): RankedPopularContent {
  return { content: buildContent(id), playCount, completeCount };
}

/** 편성 배치가 하루 한 번 채우는 선호도 캐시(domain.md 7.2) — 피드는 이것을 읽기만 한다 */
function buildPreference(
  signalCount: number,
  topicWeights: Record<string, number>,
): UserPreferenceWeights {
  return {
    topicWeights,
    authorWeights: {},
    keywordWeights: {},
    formatWeights: {},
    durationPref: null,
    tasteEmbedding: null,
    signalCount,
  };
}

function buildLibraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-1',
    userId: USER_ID,
    contentId: CONTENT_ID,
    source: LibraryItemSource.SAVE,
    status: LibraryItemStatus.UNPLAYED,
    addedAt: NOW,
    deletedAt: null,
    ...overrides,
  } as LibraryItem;
}

async function catchError(
  promise: Promise<unknown>,
): Promise<BusinessException> {
  try {
    await promise;
  } catch (error) {
    return error as BusinessException;
  }

  throw new Error('예외가 발생하지 않았다');
}

/** 시리즈 카드 스위치만 읽는 ConfigService 대역 — 기본은 꺼짐(종전 응답) */
function configWith(
  seriesCards?: string,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: string) =>
      key === 'SERIES_EXPLORE_CARDS_ENABLED' ? seriesCards : undefined,
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

/** 콘텐츠 행으로 좁힌다 — 스위치가 꺼져 있으면 시리즈 카드는 나오지 않는다 */
function asContent(item: ExploreListItemView): ExploreItemView {
  if (item.type === 'series') {
    throw new Error('시리즈 카드가 나왔다');
  }
  return item;
}

describe('ExploreOrchestrator', () => {
  let orchestrator: ExploreOrchestrator;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
  let playbackService: jest.Mocked<PlaybackService>;
  let userInterestService: jest.Mocked<UserInterestService>;
  let topicService: jest.Mocked<TopicService>;
  let dripExclusionService: jest.Mocked<DripExclusionService>;
  let preferenceVectorService: jest.Mocked<PreferenceVectorService>;
  let searchQueryLogService: jest.Mocked<SearchQueryLogService>;
  let seriesService: jest.Mocked<SeriesService>;
  let queryEmbeddingClient: jest.Mocked<QueryEmbeddingClient>;

  beforeEach(() => {
    contentService = {
      findCandidates: jest.fn().mockResolvedValue([]),
      findRecent: jest.fn().mockResolvedValue([]),
      findPopularPage: jest
        .fn()
        .mockResolvedValue({ items: [], hasNext: false }),
      findExplorePage: jest
        .fn()
        .mockResolvedValue({ items: [], hasNext: false }),
      findSearchPage: jest
        .fn()
        .mockResolvedValue({ items: [], hasNext: false }),
      findHybridSearchPage: jest.fn().mockResolvedValue({
        items: [],
        hasNext: false,
        keywordMatched: false,
      }),
      findSearchCorrection: jest.fn().mockResolvedValue(null),
      findRelatedContents: jest.fn().mockResolvedValue([]),
      findTopicViews: jest.fn().mockResolvedValue([]),
      findScorableEmbeddings: jest.fn().mockResolvedValue(new Map()),
      getPublishedById: jest.fn().mockResolvedValue(buildContent(CONTENT_ID)),
      getById: jest.fn().mockResolvedValue(buildContent(CONTENT_ID)),
    } as unknown as jest.Mocked<ContentService>;

    libraryService = {
      save: jest.fn().mockResolvedValue({
        item: buildLibraryItem(),
        created: true,
        reactivated: false,
      }),
      unsave: jest.fn().mockResolvedValue(true),
      findCompletedContentIds: jest.fn().mockResolvedValue(new Set()),
      findActiveItems: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LibraryService>;

    playbackService = {
      countSignals: jest.fn().mockResolvedValue(0),
      findRecentSignals: jest.fn().mockResolvedValue([]),
      findCountedContentIds: jest.fn().mockResolvedValue(new Set<string>()),
      buildQuotaForUser: jest.fn().mockResolvedValue(QUOTA),
      recordSignal: jest.fn(),
    } as unknown as jest.Mocked<PlaybackService>;

    userInterestService = {
      findActiveTopicIds: jest.fn().mockResolvedValue([]),
      findAllActive: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserInterestService>;

    topicService = {
      findAllByIds: jest.fn().mockResolvedValue([]),
      findAllVisible: jest.fn().mockResolvedValue([]),
      findVisibleRelatedByName: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TopicService>;

    dripExclusionService = {
      exclude: jest.fn(),
    } as unknown as jest.Mocked<DripExclusionService>;

    preferenceVectorService = {
      findWeights: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PreferenceVectorService>;

    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    searchQueryLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SearchQueryLogService>;

    seriesService = {
      findRefs: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<SeriesService>;

    // 기본은 결손(AI 서버 미설정) — 의미 엔진 없이 키워드만
    queryEmbeddingClient = {
      embed: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<QueryEmbeddingClient>;

    orchestrator = new ExploreOrchestrator(
      contentService,
      libraryService,
      playbackService,
      userInterestService,
      topicService,
      dripExclusionService,
      preferenceVectorService,
      // 순수 판정 서비스라 모킹하지 않는다 — 랭킹 규칙 자체가 검증 대상이다
      new DripScoringService(),
      dataSource,
      searchQueryLogService,
      seriesService,
      configWith(),
      queryEmbeddingClient,
    );
  });

  describe('getFeed', () => {
    it('관심 주제가 있으면 관심사 섹션이 피드에 포함된다', async () => {
      // given — 캐시의 완청 수가 3건 이상이라 콜드스타트가 아니다
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      preferenceVectorService.findWeights.mockResolvedValue(
        buildPreference(5, { [TOPIC_ID]: 2 }),
      );
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(result.sections[0].key).toBe(ExploreSectionKey.INTEREST);
      expect(result.sections[0].title).toBe('관심사에 맞는 추천');
    });

    it('신호가 부족한 신규 사용자에게는 인기·신규 섹션을 앞에 둔다', async () => {
      // given — 콜드스타트(FR-17)는 완청 3건 미만이다
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      preferenceVectorService.findWeights.mockResolvedValue(
        buildPreference(2, {}),
      );
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);
      contentService.findPopularPage.mockResolvedValue({
        items: [buildPopularRow(OTHER_CONTENT_ID)],
        hasNext: false,
      });
      contentService.findRecent.mockResolvedValue([
        buildContent(OTHER_CONTENT_ID),
      ]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(result.sections.map((section) => section.key).slice(0, 2)).toEqual(
        [ExploreSectionKey.POPULAR, ExploreSectionKey.NEW],
      );
    });

    it('랭킹은 신호를 재집계하지 않고 선호도 캐시를 읽는다', async () => {
      // given — 실시간 재계산은 하지 않는다(domain.md 7.2)
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      preferenceVectorService.findWeights.mockResolvedValue(
        buildPreference(5, { [TOPIC_ID]: 2 }),
      );
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);

      // when
      await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(playbackService.findRecentSignals).not.toHaveBeenCalled();
      expect(playbackService.countSignals).not.toHaveBeenCalled();
      expect(preferenceVectorService.findWeights).toHaveBeenCalledWith(USER_ID);
    });

    it('같은 주제의 콘텐츠도 취향 임베딩에 가까운 편이 앞에 온다 — 주제 가중치만으로는 동점이다', async () => {
      // given — 둘 다 TOPIC_ID 하나뿐이라 주제 점수는 같다. 취향 벡터는 OTHER 쪽과 같은 방향
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      preferenceVectorService.findWeights.mockResolvedValue({
        ...buildPreference(5, { [TOPIC_ID]: 2 }),
        tasteEmbedding: [0, 1],
      });
      // 후보는 인기순으로 CONTENT_ID가 먼저 들어온다
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
        buildContent(OTHER_CONTENT_ID),
      ]);
      contentService.findTopicViews.mockResolvedValue([
        { contentId: CONTENT_ID, topicId: TOPIC_ID },
        { contentId: OTHER_CONTENT_ID, topicId: TOPIC_ID },
      ] as never);
      contentService.findScorableEmbeddings.mockResolvedValue(
        new Map([
          [CONTENT_ID, [1, 0]],
          [OTHER_CONTENT_ID, [0, 1]],
        ]),
      );

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then — 종전(주제 가중치만)이면 인기순 그대로 CONTENT_ID가 먼저였다
      const interest = result.sections.find(
        (section) => section.key === ExploreSectionKey.INTEREST,
      );
      expect(interest?.items.map((item) => asContent(item).content.id)).toEqual(
        [OTHER_CONTENT_ID, CONTENT_ID],
      );
    });

    it('임베딩·취향 벡터가 없으면 주제 가중치와 인기순으로 종전과 같이 정렬한다', async () => {
      // given — 취향 벡터 null, 콘텐츠 임베딩 없음 → 임베딩 축이 빠지고 주제 축만 남는다
      const LIKED_TOPIC = 'dddddddd-1111-4111-8111-111111111111';
      userInterestService.findActiveTopicIds.mockResolvedValue([
        TOPIC_ID,
        LIKED_TOPIC,
      ]);
      preferenceVectorService.findWeights.mockResolvedValue(
        buildPreference(5, { [TOPIC_ID]: -1, [LIKED_TOPIC]: 2 }),
      );
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
        buildContent(OTHER_CONTENT_ID),
      ]);
      contentService.findTopicViews.mockResolvedValue([
        { contentId: CONTENT_ID, topicId: TOPIC_ID },
        { contentId: OTHER_CONTENT_ID, topicId: LIKED_TOPIC },
      ] as never);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      const interest = result.sections.find(
        (section) => section.key === ExploreSectionKey.INTEREST,
      );
      expect(interest?.items.map((item) => asContent(item).content.id)).toEqual(
        [OTHER_CONTENT_ID, CONTENT_ID],
      );
    });

    it('선호도 캐시가 없는 사용자는 콜드스타트로 그린다', async () => {
      // given — 가입 직후·첫 배치 이전에는 `user_preference_vectors` 행이 없다
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      preferenceVectorService.findWeights.mockResolvedValue(null);
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);
      contentService.findPopularPage.mockResolvedValue({
        items: [buildPopularRow(OTHER_CONTENT_ID)],
        hasNext: false,
      });
      contentService.findRecent.mockResolvedValue([
        buildContent(OTHER_CONTENT_ID),
      ]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(result.sections.map((section) => section.key).slice(0, 2)).toEqual(
        [ExploreSectionKey.POPULAR, ExploreSectionKey.NEW],
      );
    });

    it('이미 라이브러리에 있는 콘텐츠도 라이브러리 상태를 달고 그대로 노출된다', async () => {
      // given — 초기 콘텐츠 풀이 작아 제외하면 피드가 빈다(`explore.md` 4.1)
      contentService.findRecent.mockResolvedValue([buildContent(CONTENT_ID)]);
      libraryService.findActiveItems.mockResolvedValue([buildLibraryItem()]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      const item = asContent(result.sections[0].items[0]);
      expect(item.content.id).toBe(CONTENT_ID);
      expect(item.library).toEqual({
        itemId: 'item-1',
        source: LibraryItemSource.SAVE,
        status: LibraryItemStatus.UNPLAYED,
      });
    });

    it('비어 있는 섹션은 내려주지 않는다', async () => {
      // given — 제목만 있고 아무것도 없는 줄을 그리게 된다
      contentService.findRecent.mockResolvedValue([buildContent(CONTENT_ID)]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].key).toBe(ExploreSectionKey.NEW);
    });

    it('노출할 콘텐츠가 하나도 없으면 빈 배열을 내려준다', async () => {
      // given — 빈 피드는 정상 상태다. 404가 아니다

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(result.sections).toEqual([]);
    });

    it('피드에 잔여 재생 표시값을 함께 실어 보낸다', async () => {
      // given — 피드를 여는 시점이 곧 이 값을 갱신하는 시점이다

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(result.quota).toEqual(QUOTA);
    });

    it('피드의 인기 섹션은 기본 구간(월간)으로 만든다', async () => {
      // given — 주간은 초기에 표본이 너무 적고, 온보딩 추천도 직전 확정 월을 쓴다

      // when
      await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(contentService.findPopularPage).toHaveBeenCalledWith(
        expect.objectContaining({ periodType: StatsPeriodType.MONTH }),
      );
    });

    it('인기 섹션에만 period를 실어 보낸다', async () => {
      // given — 클라이언트가 토글의 선택 상태를 그리는 근거다.
      // 기본값을 양쪽에 두면 서버가 그것을 바꿀 때 토글만 옛 값에 머문다
      contentService.findPopularPage.mockResolvedValue({
        items: [buildPopularRow(OTHER_CONTENT_ID)],
        hasNext: false,
      });
      contentService.findRecent.mockResolvedValue([buildContent(CONTENT_ID)]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);
      const popular = result.sections.find(
        (section) => section.key === ExploreSectionKey.POPULAR,
      );
      const recent = result.sections.find(
        (section) => section.key === ExploreSectionKey.NEW,
      );

      // then
      expect(popular?.period).toBe(StatsPeriodType.MONTH);
      expect(recent?.period).toBeNull();
    });

    it('주제별 모아보기 섹션의 제목은 주제 이름이다', async () => {
      // given
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      topicService.findAllByIds.mockResolvedValue([
        { id: TOPIC_ID, name: '커리어' } as Topic,
      ]);
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW, UserMarket.KR);
      const topicGroup = result.sections.find(
        (section) => section.key === ExploreSectionKey.TOPIC_GROUP,
      );

      // then
      expect(topicGroup?.title).toBe('커리어');
      expect(topicGroup?.topic).toEqual({ id: TOPIC_ID, name: '커리어' });
    });
  });

  describe('getPopular', () => {
    const POPULAR_QUERY = {
      period: StatsPeriodType.WEEK,
      cursor: null,
      limit: 20,
    };

    it('요청한 구간으로 조회하고 그 구간을 응답에 되돌린다', async () => {
      // given — 클라이언트는 이 값으로 토글의 선택 상태를 그린다

      // when
      const result = await orchestrator.getPopular(
        USER_ID,
        POPULAR_QUERY,
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentService.findPopularPage).toHaveBeenCalledWith(
        expect.objectContaining({ periodType: StatsPeriodType.WEEK }),
      );
      expect(result.period).toBe(StatsPeriodType.WEEK);
    });

    it('다음 페이지가 있으면 마지막 항목의 정렬 키로 커서를 발급한다', async () => {
      // given — 확정 구간이 없으면 재생·완청 수가 전부 0이라 동점이 기본값이다
      const lastContent = buildContent(OTHER_CONTENT_ID);
      contentService.findPopularPage.mockResolvedValue({
        items: [
          buildPopularRow(CONTENT_ID, 9, 4),
          { content: lastContent, playCount: 3, completeCount: 1 },
        ],
        hasNext: true,
      });

      // when
      const result = await orchestrator.getPopular(
        USER_ID,
        POPULAR_QUERY,
        NOW,
        UserMarket.KR,
      );

      // then
      expect(
        decodePopularCursor(result.nextCursor ?? '', StatsPeriodType.WEEK),
      ).toEqual({
        playCount: 3,
        completeCount: 1,
        publishedAt: lastContent.publishedAt,
        id: OTHER_CONTENT_ID,
      });
    });

    it('구간이 바뀐 커서는 거절한다', async () => {
      // given — 구간이 섞인 목록이 만들어지면 안 된다
      const cursor = encodePopularCursor(
        {
          playCount: 3,
          completeCount: 1,
          publishedAt: NOW,
          id: CONTENT_ID,
        },
        StatsPeriodType.WEEK,
      );

      // when
      const error = await catchError(
        orchestrator.getPopular(
          USER_ID,
          { ...POPULAR_QUERY, period: StatsPeriodType.MONTH, cursor },
          NOW,
          UserMarket.KR,
        ),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
    });

    it('인기 목록에도 잔여 재생 표시값을 싣는다', async () => {
      // given — 이 응답이 최신값 갱신 시점이 된다

      // when
      const result = await orchestrator.getPopular(
        USER_ID,
        POPULAR_QUERY,
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.quota).toEqual(QUOTA);
    });
  });

  describe('getTopicChips', () => {
    const OTHER_TOPIC_ID = 'dddddddd-1111-4111-8111-111111111111';
    const HIDDEN_TOPIC_ID = 'eeeeeeee-1111-4111-8111-111111111111';

    function buildTopic(id: string, name: string, displayOrder = 0): Topic {
      return { id, name, displayOrder } as Topic;
    }

    it('관심 주제를 선택한 순서로 앞에 두고 나머지를 뒤에 붙인다', async () => {
      // given — `findAllActive`가 `created_at` 오름차순이라 이 순서가 곧 선택한 순서다
      userInterestService.findAllActive.mockResolvedValue([
        { topicId: OTHER_TOPIC_ID },
        { topicId: TOPIC_ID },
      ] as UserInterest[]);
      topicService.findAllByIds.mockResolvedValue([
        buildTopic(TOPIC_ID, '커리어'),
        buildTopic(OTHER_TOPIC_ID, '생산성'),
      ]);
      topicService.findAllVisible.mockResolvedValue([
        buildTopic(TOPIC_ID, '커리어'),
        buildTopic(OTHER_TOPIC_ID, '생산성'),
        buildTopic(HIDDEN_TOPIC_ID, 'IT·테크'),
      ]);

      // when
      const chips = await orchestrator.getTopicChips(USER_ID, UserMarket.KR);

      // then
      expect(chips).toEqual([
        { id: OTHER_TOPIC_ID, name: '생산성', isInterest: true },
        { id: TOPIC_ID, name: '커리어', isInterest: true },
        { id: HIDDEN_TOPIC_ID, name: 'IT·테크', isInterest: false },
      ]);
    });

    it('관심 주제의 숨김 판정은 다시 하지 않는다 — findAllActive가 넘긴 주제는 그대로 칩이 된다', async () => {
      // given — 숨김 주제는 보유 여부와 무관하게 칩에서 빠진다(팀 결정 2026-08-11). 그 판정은
      // `UserInterestService.findAllActive`가 맡으므로 여기서 같은 필터를 두 번 걸지 않는다.
      // 아래는 그 경계를 고정하는 목(mock) 상황이고, 실제로 숨김 주제가 넘어오는 일은 없다
      userInterestService.findAllActive.mockResolvedValue([
        { topicId: HIDDEN_TOPIC_ID },
      ] as UserInterest[]);
      topicService.findAllByIds.mockResolvedValue([
        buildTopic(HIDDEN_TOPIC_ID, '숨겨진 주제'),
      ]);
      topicService.findAllVisible.mockResolvedValue([
        buildTopic(TOPIC_ID, '커리어'),
      ]);

      // when
      const chips = await orchestrator.getTopicChips(USER_ID, UserMarket.KR);

      // then
      expect(chips[0]).toEqual({
        id: HIDDEN_TOPIC_ID,
        name: '숨겨진 주제',
        isInterest: true,
      });
    });

    it('관심 주제가 아닌 숨겨진 주제는 노출하지 않는다', async () => {
      // given — 콘텐츠 풀이 없는 주제는 애초에 고를 수 없다(FR-38)
      topicService.findAllVisible.mockResolvedValue([
        buildTopic(TOPIC_ID, '커리어'),
      ]);

      // when
      const chips = await orchestrator.getTopicChips(USER_ID, UserMarket.KR);

      // then
      expect(chips.map((chip) => chip.id)).toEqual([TOPIC_ID]);
    });

    it('관심 주제가 없으면 노출 주제만 내려준다', async () => {
      // given — 정상 상태는 아니지만 방어한다
      topicService.findAllVisible.mockResolvedValue([
        buildTopic(TOPIC_ID, '커리어'),
        buildTopic(OTHER_TOPIC_ID, '생산성'),
      ]);

      // when
      const chips = await orchestrator.getTopicChips(USER_ID, UserMarket.KR);

      // then
      expect(chips.every((chip) => !chip.isInterest)).toBe(true);
      expect(chips).toHaveLength(2);
    });
  });

  describe('getContents', () => {
    it('시리즈 편에는 series 객체를, 단일 콘텐츠에는 null을 싣는다(KAN-134)', async () => {
      // given
      contentService.findExplorePage.mockResolvedValue({
        items: [
          { content: buildContent(CONTENT_ID), playCount: 9 },
          { content: buildContent(OTHER_CONTENT_ID), playCount: 3 },
        ],
        hasNext: false,
      });
      const ref = {
        id: '77777777-7777-4777-8777-777777777777',
        title: '시리즈',
        episodeNo: 2,
        totalEpisodes: 16,
      };
      seriesService.findRefs.mockResolvedValue(new Map([[CONTENT_ID, ref]]));

      // when
      const result = await orchestrator.getContents(
        USER_ID,
        { topicIds: [TOPIC_ID], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(
        result.items.map((item) => asContent(item).content.series),
      ).toEqual([ref, null]);
    });

    it('다음 페이지가 있으면 마지막 항목 위치로 커서를 발급한다', async () => {
      // given
      const lastContent = buildContent(OTHER_CONTENT_ID);
      contentService.findExplorePage.mockResolvedValue({
        items: [
          { content: buildContent(CONTENT_ID), playCount: 9 },
          { content: lastContent, playCount: 3 },
        ],
        hasNext: true,
      });

      // when
      const result = await orchestrator.getContents(
        USER_ID,
        { topicIds: [TOPIC_ID], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(decodeExploreCursor(result.nextCursor ?? '', [TOPIC_ID])).toEqual({
        playCount: 3,
        publishedAt: lastContent.publishedAt,
        id: OTHER_CONTENT_ID,
      });
    });

    it('마지막 페이지에는 커서를 발급하지 않는다', async () => {
      // given — 끝인지 아닌지를 두 값이 말하면 어긋난다
      contentService.findExplorePage.mockResolvedValue({
        items: [{ content: buildContent(CONTENT_ID), playCount: 0 }],
        hasNext: false,
      });

      // when
      const result = await orchestrator.getContents(
        USER_ID,
        { topicIds: [TOPIC_ID], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.nextCursor).toBeNull();
    });

    it('필터 목록에도 잔여 재생 표시값을 유지한다', async () => {
      // given — 필터 전환 후에도 표시는 유지된다(`explore.md` 4.4-1)

      // when
      const result = await orchestrator.getContents(
        USER_ID,
        { topicIds: [TOPIC_ID], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.quota).toEqual(QUOTA);
    });
  });

  describe('saveContent', () => {
    it('사용자가 직접 담으면 save 신호를 적재한다', async () => {
      // given — 편성·추천 갱신의 입력(FR-15)

      // when
      await orchestrator.saveContent({
        market: UserMarket.KR,
        userId: USER_ID,
        contentId: CONTENT_ID,
        reason: SaveReason.USER_SAVE,
        now: NOW,
      });

      // then
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        UserSignalAction.SAVE,
        expect.anything(),
      );
    });

    it('이미 담긴 콘텐츠를 다시 담으면 신호를 남기지 않는다', async () => {
      // given — 라이브러리는 그대로인데 신호만 쌓이면 그 주제의 가중치가 부풀려진다.
      // 사용자가 화면에서 두 번 누를 수는 없고(시트가 [제거]로 바뀐다) 큐 재전송이 경로다
      libraryService.save.mockResolvedValue({
        item: buildLibraryItem(),
        created: false,
        reactivated: false,
      });

      // when
      await orchestrator.saveContent({
        market: UserMarket.KR,
        userId: USER_ID,
        contentId: CONTENT_ID,
        reason: SaveReason.USER_SAVE,
        now: NOW,
      });

      // then
      expect(playbackService.recordSignal).not.toHaveBeenCalled();
    });

    it('지웠던 콘텐츠를 다시 담으면 신호를 남긴다', async () => {
      // given — 행을 새로 만들지는 않았지만 사용자의 진짜 담기 조작이다
      libraryService.save.mockResolvedValue({
        item: buildLibraryItem(),
        created: false,
        reactivated: true,
      });

      // when
      await orchestrator.saveContent({
        market: UserMarket.KR,
        userId: USER_ID,
        contentId: CONTENT_ID,
        reason: SaveReason.USER_SAVE,
        now: NOW,
      });

      // then
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        UserSignalAction.SAVE,
        expect.anything(),
      );
    });

    it('재생 자동 적립은 save 신호를 남기지 않는다', async () => {
      // given — 사용자의 "담기" 의사가 아니라서 적재하면 추천 입력이 왜곡된다

      // when
      await orchestrator.saveContent({
        market: UserMarket.KR,
        userId: USER_ID,
        contentId: CONTENT_ID,
        reason: SaveReason.AUTO_PLAY,
        now: NOW,
      });

      // then
      expect(playbackService.recordSignal).not.toHaveBeenCalled();
      expect(libraryService.save).toHaveBeenCalled();
    });

    it('회수된 콘텐츠는 담기지 않는다', async () => {
      // given — 피드에서 걸러도 이미 화면에 떠 있는 행이 탭될 수 있다
      contentService.getPublishedById.mockRejectedValue(
        new BusinessException({
          status: 403,
          errorCode: ErrorCode.CONTENT_WITHDRAWN,
          message: '제공이 종료된 콘텐츠예요',
        }),
      );

      // when
      const error = await catchError(
        orchestrator.saveContent({
          market: UserMarket.KR,
          userId: USER_ID,
          contentId: CONTENT_ID,
          reason: SaveReason.USER_SAVE,
          now: NOW,
        }),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.CONTENT_WITHDRAWN);
      expect(libraryService.save).not.toHaveBeenCalled();
    });

    it('담기에는 재생 한도를 판정하지 않는다', async () => {
      // given — 담기는 횟수 제한이 없고 페이월을 노출하지 않는다(PRD 5.4)

      // when
      const result = await orchestrator.saveContent({
        market: UserMarket.KR,
        userId: USER_ID,
        contentId: CONTENT_ID,
        reason: SaveReason.USER_SAVE,
        now: NOW,
      });

      // then
      expect(result.quota).toEqual(QUOTA);
      expect(result.created).toBe(true);
    });
  });

  describe('unsaveContent', () => {
    it('해제하면 드립 영구 제외와 unsave 신호를 함께 적재한다', async () => {
      // given — 제거는 "관심 없음" 신호이므로 라이브러리 삭제와 같은 결과다(FR-16)

      // when
      await orchestrator.unsaveContent(USER_ID, CONTENT_ID, NOW);

      // then
      expect(dripExclusionService.exclude).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        DripExclusionReason.UNSAVE,
        NOW,
        expect.anything(),
      );
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        UserSignalAction.UNSAVE,
        expect.anything(),
      );
    });

    it('해제할 대상이 없으면 제외도 신호도 적재하지 않는다', async () => {
      // given — 오프라인 큐 재전송이 같은 해제를 다시 보낼 수 있다
      libraryService.unsave.mockResolvedValue(false);

      // when
      await orchestrator.unsaveContent(USER_ID, CONTENT_ID, NOW);

      // then
      expect(dripExclusionService.exclude).not.toHaveBeenCalled();
      expect(playbackService.recordSignal).not.toHaveBeenCalled();
    });

    it('회수된 콘텐츠도 라이브러리에서 뺄 수 있다', async () => {
      // given — 회수를 이유로 막으면 목록에 남은 항목을 영영 치울 수 없다

      // when
      await orchestrator.unsaveContent(USER_ID, CONTENT_ID, NOW);

      // then
      expect(contentService.getById).toHaveBeenCalled();
      expect(contentService.getPublishedById).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    const SEARCH_ROW = {
      content: buildContent(CONTENT_ID),
      score: 8,
      titleSimilarity: 0.5,
      playCount: 3,
    };
    const HYBRID_ROW = {
      content: buildContent(CONTENT_ID),
      position: rrfPosition(CONTENT_ID, 1 / 61, 3),
      matchedBy: ['keyword'] as SearchEngine[],
    };
    const SEMANTIC_ROW = {
      content: buildContent(OTHER_CONTENT_ID),
      position: rrfPosition(OTHER_CONTENT_ID, 1 / 62, 1),
      matchedBy: ['semantic'] as SearchEngine[],
    };
    const VECTOR = [0.1, 0.2];
    const query = (overrides: Partial<ExploreSearchQuery> = {}) => ({
      query: '커리어',
      topicIds: [],
      cursor: null,
      limit: 20,
      exact: false,
      ...overrides,
    });

    it('NFD 분해형 입력을 NFC로 정규화해 조회한다', async () => {
      // given — "커리"의 NFD 분해형(4 코드포인트). 정규화 없이는 저장 텍스트와 매칭되지 않는다
      const nfd = '커리'.normalize('NFD');

      // when
      await orchestrator.search(
        USER_ID,
        query({ query: nfd }),
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentService.findHybridSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({ normalizedQuery: '커리' }),
      );
      expect(queryEmbeddingClient.embed).toHaveBeenCalledWith('커리');
    });

    it.each([
      ['정규화 후 2자 미만(NFD "커")', '커'.normalize('NFD')],
      ['#을 뗀 뒤 2자 미만(#a)', '#a'],
      ['특수문자만', '!!??'],
    ])('%s이면 조회 없이 거절한다', async (_label, raw) => {
      // when
      const error = await catchError(
        orchestrator.search(USER_ID, query({ query: raw }), NOW, UserMarket.KR),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.VALIDATION_FAILED);
      expect(contentService.findSearchPage).not.toHaveBeenCalled();
      expect(contentService.findHybridSearchPage).not.toHaveBeenCalled();
    });

    describe('# 태그 전용 — 종전 경로', () => {
      it('#을 뗀 검색어로 태그 전용 조회를 하고, 교정·의미 엔진은 돌리지 않으며, 로그에는 #을 남긴다(KAN-218)', async () => {
        // given
        contentService.findSearchPage.mockResolvedValue({
          items: [SEARCH_ROW],
          hasNext: false,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '#뱅크런', exact: true }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findSearchPage).toHaveBeenCalledWith(
          expect.objectContaining({ normalizedQuery: '뱅크런', tagOnly: true }),
        );
        expect(contentService.findHybridSearchPage).not.toHaveBeenCalled();
        expect(contentService.findSearchCorrection).not.toHaveBeenCalled();
        expect(queryEmbeddingClient.embed).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          queryUsed: '#뱅크런',
          correctedFrom: null,
          match: 'keyword',
          engines: ['keyword'],
          matchedBy: [['keyword']],
        });
        expect(searchQueryLogService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            normalizedQuery: '#뱅크런',
            queryUsed: '#뱅크런',
            engines: ['keyword'],
          }),
          NOW,
        );
      });

      it('빈 결과는 #을 뗀 검색어로 관련 주제를 찾는다', async () => {
        // when
        await orchestrator.search(
          USER_ID,
          query({ query: '#커리어' }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(topicService.findVisibleRelatedByName).toHaveBeenCalledWith(
          '커리어',
          expect.any(Number),
          UserMarket.KR,
        );
      });

      it('다음 페이지 커서는 종전 모양(다섯 정렬 키)이다', async () => {
        // given
        contentService.findSearchPage.mockResolvedValue({
          items: [SEARCH_ROW],
          hasNext: true,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '#커리어', limit: 1 }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(
          decodeSearchCursor(result.nextCursor as string, '#커리어', []),
        ).toEqual({
          score: 8,
          titleSimilarity: 0.5,
          playCount: 3,
          publishedAt: SEARCH_ROW.content.publishedAt,
          id: CONTENT_ID,
        });
      });
    });

    describe('하이브리드', () => {
      it('질의 벡터를 받아 두 엔진으로 조회하고 engines·matched_by·match를 싣는다', async () => {
        // given
        queryEmbeddingClient.embed.mockResolvedValue(VECTOR);
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [HYBRID_ROW, SEMANTIC_ROW],
          hasNext: false,
          keywordMatched: true,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query(),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findHybridSearchPage).toHaveBeenCalledWith(
          expect.objectContaining({
            normalizedQuery: '커리어',
            queryVector: VECTOR,
          }),
        );
        expect(result).toMatchObject({
          queryUsed: '커리어',
          correctedFrom: null,
          match: 'keyword',
          engines: ['keyword', 'semantic'],
          matchedBy: [['keyword'], ['semantic']],
          fallback: null,
        });
        expect(contentService.findSearchCorrection).not.toHaveBeenCalled();
      });

      it('AI 서버 결손(벡터 없음)이면 의미 엔진 없이 조회하고 engines에 semantic이 없다', async () => {
        // given
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [HYBRID_ROW],
          hasNext: false,
          keywordMatched: true,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query(),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findHybridSearchPage).toHaveBeenCalledWith(
          expect.objectContaining({ queryVector: null }),
        );
        expect(result.engines).toEqual(['keyword']);
      });

      it('첫 페이지가 의미 결과뿐이면 match: related', async () => {
        // given — 교정어도 없다
        queryEmbeddingClient.embed.mockResolvedValue(VECTOR);
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [SEMANTIC_ROW],
          hasNext: false,
          keywordMatched: false,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '이직' }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(result.match).toBe('related');
        expect(result.correctedFrom).toBeNull();
      });

      it('첫 페이지 검색은 입력·실제 검색어·건수·키워드 건수·엔진을 로그로 남긴다', async () => {
        // given
        queryEmbeddingClient.embed.mockResolvedValue(VECTOR);
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [HYBRID_ROW, SEMANTIC_ROW],
          hasNext: true,
          keywordMatched: true,
        });

        // when
        await orchestrator.search(
          USER_ID,
          query({ query: ' 커리어 ', topicIds: [TOPIC_ID], limit: 2 }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(searchQueryLogService.record).toHaveBeenCalledWith(
          {
            userId: USER_ID,
            normalizedQuery: '커리어',
            queryUsed: '커리어',
            resultCount: 2,
            keywordCount: 1,
            engines: ['keyword', 'semantic'],
            exact: false,
            hasNext: true,
            topicFilterCount: 1,
            resultContentIds: [CONTENT_ID, OTHER_CONTENT_ID],
          },
          NOW,
        );
      });

      it('두 엔진 0건·교정어 없음이면 0건으로 로그를 남기고 관련 주제·인기 fallback을 조립한다', async () => {
        // given — 초기 콘텐츠 풀이 작아 빈 결과 UX가 중요하다 (explore.md 4.5-3)
        topicService.findVisibleRelatedByName.mockResolvedValue([
          { id: TOPIC_ID, name: '커리어' } as Topic,
        ]);
        contentService.findPopularPage.mockResolvedValue({
          items: [buildPopularRow(OTHER_CONTENT_ID)],
          hasNext: false,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '없는검색어' }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(result.items).toHaveLength(0);
        expect(result.match).toBe('keyword');
        expect(result.fallback?.relatedTopics).toEqual([
          { id: TOPIC_ID, name: '커리어' },
        ]);
        expect(result.fallback?.popularItems).toHaveLength(1);
        expect(searchQueryLogService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            normalizedQuery: '없는검색어',
            resultCount: 0,
            keywordCount: 0,
          }),
          NOW,
        );
      });

      it('빈 커서(cursor=)도 첫 페이지로 보고 검색 로그를 남긴다 — 디코드·로그·대체 콘텐츠가 같은 기준이다', async () => {
        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '없는말', cursor: '' }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(searchQueryLogService.record).toHaveBeenCalledTimes(1);
        expect(result.fallback).not.toBeNull();
      });

      it('다음 페이지가 있으면 RRF 키셋과 검색 상태를 담은 커서를 발급한다', async () => {
        // given
        queryEmbeddingClient.embed.mockResolvedValue(VECTOR);
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [HYBRID_ROW],
          hasNext: true,
          keywordMatched: true,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ limit: 1 }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(
          decodeAnySearchCursor(
            result.nextCursor as string,
            '커리어',
            [],
            false,
          ),
        ).toEqual({
          kind: 'hybrid',
          position: {
            order: 'rrf',
            rrf: 1 / 61,
            playCount: 3,
            publishedAt: HYBRID_ROW.content.publishedAt,
            id: CONTENT_ID,
          },
          state: {
            queryUsed: '커리어',
            corrected: false,
            match: 'keyword',
            semantic: true,
          },
        });
      });

      it('질의 벡터 없이 줄 세운 첫 페이지는 키워드 순서 커서를 발급하고, 다음 페이지는 그 커서로 AI 서버 없이 잇는다(KAN-242)', async () => {
        // given — 임베딩 결손(기본 mock null). 서비스는 종전 키워드 쿼리 결과를 키워드 순서 위치로 돌려준다
        const keywordPosition = {
          order: 'keyword' as const,
          score: 16,
          titleSimilarity: 0.5,
          playCount: 3,
          publishedAt: HYBRID_ROW.content.publishedAt,
          id: CONTENT_ID,
        };
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [{ ...HYBRID_ROW, position: keywordPosition }],
          hasNext: true,
          keywordMatched: true,
        });

        // when
        const first = await orchestrator.search(
          USER_ID,
          query({ limit: 1 }),
          NOW,
          UserMarket.KR,
        );
        queryEmbeddingClient.embed.mockClear();
        const next = await orchestrator.search(
          USER_ID,
          query({ limit: 1, cursor: first.nextCursor as string }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(first.engines).toEqual(['keyword']);
        expect(
          decodeAnySearchCursor(
            first.nextCursor as string,
            '커리어',
            [],
            false,
          ),
        ).toEqual({
          kind: 'hybrid',
          position: keywordPosition,
          state: {
            queryUsed: '커리어',
            corrected: false,
            match: 'keyword',
            semantic: false,
          },
        });
        expect(queryEmbeddingClient.embed).not.toHaveBeenCalled();
        expect(contentService.findHybridSearchPage).toHaveBeenLastCalledWith(
          expect.objectContaining({
            queryVector: null,
            cursor: keywordPosition,
          }),
        );
        expect(next.engines).toEqual(['keyword']);
      });
    });

    describe('교정("대신 검색")', () => {
      it('키워드 0건이면 교정어를 찾고, 교정어로 키워드 1건 이상이면 그 결과를 낸다', async () => {
        // given
        contentService.findHybridSearchPage
          .mockResolvedValueOnce({
            items: [],
            hasNext: false,
            keywordMatched: false,
          })
          .mockResolvedValueOnce({
            items: [HYBRID_ROW],
            hasNext: false,
            keywordMatched: true,
          });
        contentService.findSearchCorrection.mockResolvedValue('커리어');

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '커리오' }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findSearchCorrection).toHaveBeenCalledWith({
          market: UserMarket.KR,
          normalizedQuery: '커리오',
          includeSeriesTitles: false,
          now: NOW,
        });
        expect(contentService.findHybridSearchPage).toHaveBeenLastCalledWith(
          expect.objectContaining({ normalizedQuery: '커리어' }),
        );
        expect(result).toMatchObject({
          queryUsed: '커리어',
          correctedFrom: '커리오',
          match: 'keyword',
          fallback: null,
        });
        expect(searchQueryLogService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            normalizedQuery: '커리오',
            queryUsed: '커리어',
            keywordCount: 1,
          }),
          NOW,
        );
      });

      it('교정어로도 키워드가 0건이면 교정하지 않고 원문 결과(의미 결과)를 낸다', async () => {
        // given
        queryEmbeddingClient.embed.mockResolvedValue(VECTOR);
        contentService.findHybridSearchPage
          .mockResolvedValueOnce({
            items: [SEMANTIC_ROW],
            hasNext: false,
            keywordMatched: false,
          })
          .mockResolvedValueOnce({
            items: [SEMANTIC_ROW],
            hasNext: false,
            keywordMatched: false,
          });
        contentService.findSearchCorrection.mockResolvedValue('커리어');

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '커리오' }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(result).toMatchObject({
          queryUsed: '커리오',
          correctedFrom: null,
          match: 'related',
        });
      });

      it('교정어가 없으면 원문 결과 그대로다', async () => {
        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '커리오' }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findSearchCorrection).toHaveBeenCalled();
        expect(contentService.findHybridSearchPage).toHaveBeenCalledTimes(1);
        expect(result.correctedFrom).toBeNull();
      });

      it('exact=true면 키워드 0건이어도 교정어를 찾지 않는다', async () => {
        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '커리오', exact: true }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findSearchCorrection).not.toHaveBeenCalled();
        expect(result.queryUsed).toBe('커리오');
        expect(searchQueryLogService.record).toHaveBeenCalledWith(
          expect.objectContaining({ exact: true, queryUsed: '커리오' }),
          NOW,
        );
      });

      it('키워드가 1건이라도 있으면 교정어를 찾지 않는다', async () => {
        // given
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [HYBRID_ROW],
          hasNext: false,
          keywordMatched: true,
        });

        // when
        await orchestrator.search(USER_ID, query(), NOW, UserMarket.KR);

        // then
        expect(contentService.findSearchCorrection).not.toHaveBeenCalled();
      });
    });

    describe('커서 페이지', () => {
      const hybridCursor = (
        state: {
          queryUsed: string;
          corrected: boolean;
          match: 'keyword' | 'related';
          semantic: boolean;
        },
        exact = false,
      ) =>
        encodeHybridSearchCursor(
          {
            order: 'rrf',
            rrf: 1 / 61,
            playCount: 3,
            publishedAt: NOW,
            id: CONTENT_ID,
          },
          state,
          '커리오',
          [],
          exact,
        );

      it('커서의 교정어·match로 잇고 교정을 다시 판정하지 않으며 로그를 남기지 않는다', async () => {
        // given
        queryEmbeddingClient.embed.mockResolvedValue(VECTOR);
        contentService.findHybridSearchPage.mockResolvedValue({
          items: [HYBRID_ROW],
          hasNext: false,
          keywordMatched: true,
        });
        const cursor = hybridCursor({
          queryUsed: '커리어',
          corrected: true,
          match: 'keyword',
          semantic: true,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '커리오', cursor }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findHybridSearchPage).toHaveBeenCalledWith(
          expect.objectContaining({
            normalizedQuery: '커리어',
            queryVector: VECTOR,
            cursor: {
              order: 'rrf',
              rrf: 1 / 61,
              playCount: 3,
              publishedAt: NOW,
              id: CONTENT_ID,
            },
          }),
        );
        expect(result).toMatchObject({
          queryUsed: '커리어',
          correctedFrom: '커리오',
          match: 'keyword',
        });
        expect(contentService.findSearchCorrection).not.toHaveBeenCalled();
        expect(searchQueryLogService.record).not.toHaveBeenCalled();
      });

      it('첫 페이지가 의미 엔진 없이 줄 세워졌으면 다음 페이지도 AI 서버를 부르지 않는다', async () => {
        // given
        const cursor = hybridCursor({
          queryUsed: '커리오',
          corrected: false,
          match: 'keyword',
          semantic: false,
        });

        // when
        await orchestrator.search(
          USER_ID,
          query({ query: '커리오', cursor }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(queryEmbeddingClient.embed).not.toHaveBeenCalled();
        expect(contentService.findHybridSearchPage).toHaveBeenCalledWith(
          expect.objectContaining({ queryVector: null }),
        );
      });

      it('exact가 다른 커서는 EXPLORE_CURSOR_INVALID', async () => {
        // given
        const cursor = hybridCursor({
          queryUsed: '커리오',
          corrected: false,
          match: 'keyword',
          semantic: true,
        });

        // when
        const error = await catchError(
          orchestrator.search(
            USER_ID,
            query({ query: '커리오', cursor, exact: true }),
            NOW,
            UserMarket.KR,
          ),
        );

        // then
        expect(error.errorCode).toBe(ErrorCode.EXPLORE_CURSOR_INVALID);
      });

      it('빈 커서 페이지에는 fallback을 조립하지 않는다 — 목록의 끝이다', async () => {
        // given
        const cursor = hybridCursor({
          queryUsed: '커리오',
          corrected: false,
          match: 'keyword',
          semantic: false,
        });

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ query: '커리오', cursor }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(result.items).toHaveLength(0);
        expect(result.fallback).toBeNull();
        expect(topicService.findVisibleRelatedByName).not.toHaveBeenCalled();
      });

      it('종전 키워드 커서는 거절하지 않고 종전 키워드 경로로 잇는다 — 다음 커서도 종전 모양이다', async () => {
        // given — 배포 순간 옛 앱이 들고 있던 커서
        contentService.findSearchPage.mockResolvedValue({
          items: [SEARCH_ROW],
          hasNext: true,
        });
        const cursor = encodeSearchCursor(
          {
            score: 8,
            titleSimilarity: 0.5,
            playCount: 3,
            publishedAt: NOW,
            id: CONTENT_ID,
          },
          '커리어',
          [],
        );

        // when
        const result = await orchestrator.search(
          USER_ID,
          query({ cursor, limit: 1 }),
          NOW,
          UserMarket.KR,
        );

        // then
        expect(contentService.findSearchPage).toHaveBeenCalledWith(
          expect.objectContaining({
            normalizedQuery: '커리어',
            tagOnly: false,
            cursor: expect.objectContaining({ score: 8 }) as unknown,
          }),
        );
        expect(contentService.findHybridSearchPage).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          engines: ['keyword'],
          correctedFrom: null,
          matchedBy: [['keyword']],
        });
        expect(
          decodeSearchCursor(result.nextCursor as string, '커리어', []),
        ).toMatchObject({ id: CONTENT_ID });
        expect(searchQueryLogService.record).not.toHaveBeenCalled();
      });
    });
  });

  describe('시리즈 카드 스위치 켬(SERIES_EXPLORE_CARDS_ENABLED=true — KAN-134 확정 설계 4번)', () => {
    const SERIES_ID = '77777777-7777-4777-8777-777777777777';
    const E1 = 'e1111111-1111-4111-8111-111111111111';
    const E2 = 'e2222222-2222-4222-8222-222222222222';
    let cards: ExploreOrchestrator;
    const episode = (id: string, episodeNo: number) =>
      buildContent(id, { seriesId: SERIES_ID, episodeNo });
    const card = {
      series: {
        id: SERIES_ID,
        title: '시리즈',
        description: '소개',
        totalEpisodes: 3,
        status: 'completed',
      },
      coverThumbnailUrl: 'https://cdn/1.webp',
      episodeCount: 3,
      topicIds: [TOPIC_ID],
    };

    beforeEach(() => {
      seriesService.findCards = jest
        .fn()
        .mockResolvedValue(new Map([[SERIES_ID, card]]));
      cards = new ExploreOrchestrator(
        contentService,
        libraryService,
        playbackService,
        userInterestService,
        topicService,
        dripExclusionService,
        preferenceVectorService,
        new DripScoringService(),
        {} as DataSource,
        searchQueryLogService,
        seriesService,
        configWith('true'),
        queryEmbeddingClient,
      );
    });

    it('관련 콘텐츠(KAN-240)는 스위치가 켜져 있어도 시리즈 카드로 접지 않고 편 행(type 키 없음)을 순서대로 낸다', async () => {
      // given — 같은 시리즈 두 편이 코사인 순으로 온다
      contentService.findRelatedContents.mockResolvedValue([
        episode(E2, 2),
        episode(E1, 1),
      ]);
      libraryService.findActiveItems.mockResolvedValue([
        buildLibraryItem({ contentId: E1 }),
      ]);
      playbackService.findCountedContentIds.mockResolvedValue(new Set([E2]));
      const query = {
        baseContentId: CONTENT_ID,
        market: UserMarket.KR,
        excludeIds: [],
        limit: 5,
        now: NOW,
      };

      // when
      const items = await cards.getRelated(USER_ID, query);

      // then
      expect(contentService.findRelatedContents).toHaveBeenCalledWith(query);
      expect(seriesService.findCards).not.toHaveBeenCalled();
      expect(items.map((item) => item.content.id)).toEqual([E2, E1]);
      expect(items.every((item) => item.type === undefined)).toBe(true);
      expect(items[0]).toMatchObject({ library: null, isCountedToday: true });
      expect(items[1].library).not.toBeNull();
      expect(items[1].isCountedToday).toBe(false);
    });

    it('주제 목록 — 시리즈 대표 편만 달라고 묻고, 대표 편은 카드로 · 나머지는 type: content 행으로 낸다', async () => {
      // given — 저장소가 대표 편(2화)과 단일 콘텐츠만 돌려준다(SQL 윈도)
      contentService.findExplorePage.mockResolvedValue({
        items: [
          { content: episode(E2, 2), playCount: 9 },
          {
            content: buildContent(CONTENT_ID, { seriesId: null }),
            playCount: 5,
          },
        ],
        hasNext: false,
      });

      // when
      const result = await cards.getContents(
        USER_ID,
        { topicIds: [TOPIC_ID], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentService.findExplorePage).toHaveBeenCalledWith(
        expect.objectContaining({ seriesAnchorsOnly: true }),
      );
      expect(result.items.map((item) => item.type)).toEqual([
        'series',
        'content',
      ]);
      expect(result.items[0]).toEqual({ type: 'series', card });
      expect(asContent(result.items[1]).content.id).toBe(CONTENT_ID);
      expect(seriesService.findCards).toHaveBeenCalledWith(
        [SERIES_ID],
        NOW,
        UserMarket.KR,
      );
    });

    it('다음 커서는 꺼진 모드와 같은 모양이다 — 마지막 항목(대표 편)의 정렬 키뿐, 이미 낸 시리즈를 싣지 않는다', async () => {
      // given
      contentService.findExplorePage.mockResolvedValueOnce({
        items: [{ content: episode(E2, 2), playCount: 9 }],
        hasNext: true,
      });

      // when
      const first = await cards.getContents(
        USER_ID,
        { topicIds: [TOPIC_ID], cursor: null, limit: 1 },
        NOW,
        UserMarket.KR,
      );

      // then
      const payload = JSON.parse(
        Buffer.from(first.nextCursor ?? '', 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(['i', 'p', 'q', 't']);
      expect(decodeExploreCursor(first.nextCursor ?? '', [TOPIC_ID])).toEqual({
        playCount: 9,
        publishedAt: episode(E2, 2).publishedAt,
        id: E2,
      });
    });

    it('검색은 시리즈 제목 일치와 대표 편만을 함께 묻고, 교정어 어휘에도 시리즈 제목을 넣는다', async () => {
      // given — 교정 경로까지 밟도록 첫 조회는 키워드 0건
      contentService.findHybridSearchPage
        .mockResolvedValueOnce({
          items: [],
          hasNext: false,
          keywordMatched: false,
        })
        .mockResolvedValueOnce({
          items: [
            {
              content: episode(E1, 1),
              position: rrfPosition(E1, 1 / 61, 3),
              matchedBy: ['keyword'],
            },
          ],
          hasNext: false,
          keywordMatched: true,
        });
      contentService.findSearchCorrection.mockResolvedValue('시리즈');

      // when
      const result = await cards.search(
        USER_ID,
        {
          query: '시리즈즈',
          topicIds: [],
          cursor: null,
          limit: 20,
          exact: false,
        },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentService.findHybridSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({
          matchSeriesTitle: true,
          seriesAnchorsOnly: true,
        }),
      );
      expect(contentService.findSearchCorrection).toHaveBeenCalledWith(
        expect.objectContaining({ includeSeriesTitles: true }),
      );
      expect(result.items).toEqual([{ type: 'series', card }]);
      expect(result.matchedBy).toEqual([['keyword']]);
      expect(result.fallback).toBeNull();
    });

    it('커서 페이지가 비면 대체 콘텐츠 없이 목록의 끝이다 — 대체 콘텐츠는 첫 페이지에만', async () => {
      // given — 대표 편 기준 키셋이라 빈 커서 페이지는 진짜 끝일 때만 나온다
      const cursor = encodeSearchCursor(
        {
          score: 10,
          titleSimilarity: 0.9,
          playCount: 3,
          publishedAt: NOW,
          id: E1,
        },
        '시리즈',
        [],
      );

      // when
      const result = await cards.search(
        USER_ID,
        { query: '시리즈', topicIds: [], cursor, limit: 20, exact: false },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result).toMatchObject({
        items: [],
        hasNext: false,
        fallback: null,
      });
    });

    it('스위치가 꺼져 있으면 조회 입력에 시리즈 키가 없고 항목에 type 키가 없다', async () => {
      // given
      contentService.findHybridSearchPage.mockResolvedValue({
        items: [
          {
            content: episode(E1, 1),
            position: rrfPosition(E1, 1 / 61, 3),
            matchedBy: ['keyword'],
          },
          {
            content: episode(E2, 2),
            position: rrfPosition(E2, 1 / 62, 2),
            matchedBy: ['keyword'],
          },
        ],
        hasNext: false,
        keywordMatched: true,
      });

      // when
      const result = await orchestrator.search(
        USER_ID,
        {
          query: '시리즈',
          topicIds: [],
          cursor: null,
          limit: 20,
          exact: false,
        },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => !('type' in item))).toBe(true);
      const [searchQuery] = contentService.findHybridSearchPage.mock.calls[0];
      expect(searchQuery).not.toHaveProperty('matchSeriesTitle');
      expect(searchQuery).not.toHaveProperty('seriesAnchorsOnly');
    });

    it('피드 — 인기·새로 나온 섹션은 SQL 대표 편으로 10건, 관심사·주제별은 넉넉히 읽어 접는다', async () => {
      // given — 주제별 후보 30건 중 시리즈 편 12건(앞쪽) + 단일 18건
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      topicService.findAllByIds.mockResolvedValue([
        { id: TOPIC_ID, name: '커리어' } as Topic,
      ]);
      const candidates = [
        ...Array.from({ length: 12 }, (_, index) =>
          episode(
            `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
            index + 1,
          ),
        ),
        ...Array.from({ length: 18 }, (_, index) =>
          buildContent(
            `10000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
            { seriesId: null },
          ),
        ),
      ];
      contentService.findCandidates.mockResolvedValue(candidates);

      // when
      const result = await cards.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(contentService.findRecent).toHaveBeenCalledWith(
        10,
        NOW,
        UserMarket.KR,
        undefined,
        true,
      );
      expect(contentService.findPopularPage).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, seriesAnchorsOnly: true }),
      );
      expect(contentService.findCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ includeTopicIds: [TOPIC_ID], limit: 30 }),
      );
      const section = result.sections.find(
        (candidate) => candidate.key === ExploreSectionKey.TOPIC_GROUP,
      );
      expect(section?.items).toHaveLength(10);
      expect(section?.items[0]).toEqual({ type: 'series', card });
      expect(
        section?.items.filter((item) => item.type === 'series'),
      ).toHaveLength(1);
    });
  });
});
