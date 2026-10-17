import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { EnvironmentVariables } from '@/config/env.validation';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentStatus, StatsPeriodType } from '@/modules/content/content.enum';
import { RankedPopularContent } from '@/modules/content/content.types';
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
  decodeExploreCursor,
  decodePopularCursor,
  decodeSearchCursor,
  encodePopularCursor,
  encodeSearchCursor,
  readSeenSeries,
} from './explore.cursor';
import { ExploreSectionKey, SaveReason } from './explore.enum';
import { ExploreOrchestrator } from './explore.orchestrator';
import { ExploreItemView, ExploreListItemView } from './explore.types';
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

    it('NFD 분해형 입력을 NFC로 정규화해 조회한다', async () => {
      // given — "커리"의 NFD 분해형(4 코드포인트). 정규화 없이는 저장 텍스트와 매칭되지 않는다
      const nfd = '커리'.normalize('NFD');

      // when
      await orchestrator.search(
        USER_ID,
        { query: nfd, topicIds: [], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentService.findSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({ normalizedQuery: '커리' }),
      );
    });

    it('정규화 후 2자 미만이면 조회 없이 거절한다', async () => {
      // given — NFD "커"(2 코드포인트)는 원문 길이 검증을 통과하지만 합성하면 1자다
      const nfd = '커'.normalize('NFD');

      // when
      const error = await catchError(
        orchestrator.search(
          USER_ID,
          { query: nfd, topicIds: [], cursor: null, limit: 20 },
          NOW,
          UserMarket.KR,
        ),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.VALIDATION_FAILED);
      expect(contentService.findSearchPage).not.toHaveBeenCalled();
    });

    it('#으로 시작하면 #을 뗀 검색어로 태그 전용 조회를 하고, 로그에는 #을 남긴다(KAN-218)', async () => {
      // when
      await orchestrator.search(
        USER_ID,
        { query: '#뱅크런', topicIds: [], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentService.findSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({ normalizedQuery: '뱅크런', tagOnly: true }),
      );
      expect(searchQueryLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ normalizedQuery: '#뱅크런' }),
        NOW,
      );
    });

    it('#을 뗀 뒤 2자 미만이면 조회 없이 거절한다 — #a', async () => {
      // when
      const error = await catchError(
        orchestrator.search(
          USER_ID,
          { query: '#a', topicIds: [], cursor: null, limit: 20 },
          NOW,
          UserMarket.KR,
        ),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.VALIDATION_FAILED);
      expect(contentService.findSearchPage).not.toHaveBeenCalled();
    });

    it('태그 전용 검색의 빈 결과는 #을 뗀 검색어로 관련 주제를 찾는다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [],
        hasNext: false,
      });

      // when
      await orchestrator.search(
        USER_ID,
        { query: '#커리어', topicIds: [], cursor: null, limit: 20 },
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

    it('특수문자만인 질의는 조회 없이 거절한다', async () => {
      // given
      // when
      const error = await catchError(
        orchestrator.search(
          USER_ID,
          { query: '!!??', topicIds: [], cursor: null, limit: 20 },
          NOW,
          UserMarket.KR,
        ),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.VALIDATION_FAILED);
      expect(contentService.findSearchPage).not.toHaveBeenCalled();
    });

    it('첫 페이지 검색은 정규화된 질의와 첫 페이지 건수를 로그로 남긴다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [SEARCH_ROW],
        hasNext: true,
      });

      // when
      await orchestrator.search(
        USER_ID,
        { query: ' 커리어 ', topicIds: [TOPIC_ID], cursor: null, limit: 1 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(searchQueryLogService.record).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          normalizedQuery: '커리어',
          resultCount: 1,
          hasNext: true,
          topicFilterCount: 1,
          resultContentIds: [CONTENT_ID],
        },
        NOW,
      );
    });

    it('0건으로 끝난 검색도 로그에 남는다 — 미스율의 분자다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [],
        hasNext: false,
      });

      // when
      await orchestrator.search(
        USER_ID,
        { query: '없는말', topicIds: [], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(searchQueryLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ normalizedQuery: '없는말', resultCount: 0 }),
        NOW,
      );
    });

    it('빈 커서(cursor=)도 첫 페이지로 보고 검색 로그를 남긴다 — 디코드·로그·대체 콘텐츠가 같은 기준이다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [],
        hasNext: false,
      });

      // when
      const result = await orchestrator.search(
        USER_ID,
        { query: '없는말', topicIds: [], cursor: '', limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(searchQueryLogService.record).toHaveBeenCalledTimes(1);
      expect(result.fallback).not.toBeNull();
    });

    it('커서 페이지는 로그를 남기지 않는다 — 같은 질의의 이어 읽기다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [SEARCH_ROW],
        hasNext: false,
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
      await orchestrator.search(
        USER_ID,
        { query: '커리어', topicIds: [], cursor, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(searchQueryLogService.record).not.toHaveBeenCalled();
    });

    it('결과가 있으면 fallback 없이 행을 돌려준다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [SEARCH_ROW],
        hasNext: false,
      });

      // when
      const result = await orchestrator.search(
        USER_ID,
        { query: '커리어', topicIds: [], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.items).toHaveLength(1);
      expect(result.fallback).toBeNull();
      expect(result.nextCursor).toBeNull();
    });

    it('다음 페이지가 있으면 마지막 행의 다섯 정렬 키를 담은 커서를 발급한다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [SEARCH_ROW],
        hasNext: true,
      });

      // when
      const result = await orchestrator.search(
        USER_ID,
        { query: '커리어', topicIds: [], cursor: null, limit: 1 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.hasNext).toBe(true);
      expect(
        decodeSearchCursor(result.nextCursor as string, '커리어', []),
      ).toEqual({
        score: 8,
        titleSimilarity: 0.5,
        playCount: 3,
        publishedAt: SEARCH_ROW.content.publishedAt,
        id: CONTENT_ID,
      });
    });

    it('첫 페이지의 빈 결과에는 관련 주제와 인기 콘텐츠 fallback을 조립한다', async () => {
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
        { query: '없는검색어', topicIds: [], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.items).toHaveLength(0);
      expect(result.fallback?.relatedTopics).toEqual([
        { id: TOPIC_ID, name: '커리어' },
      ]);
      expect(result.fallback?.popularItems).toHaveLength(1);
    });

    it('커서 페이지의 빈 결과에는 fallback을 조립하지 않는다', async () => {
      // given — 목록의 끝이지 "결과 없음" 화면이 아니다
      const cursor = await (async () => {
        contentService.findSearchPage.mockResolvedValueOnce({
          items: [SEARCH_ROW],
          hasNext: true,
        });
        const first = await orchestrator.search(
          USER_ID,
          { query: '커리어', topicIds: [], cursor: null, limit: 1 },
          NOW,
          UserMarket.KR,
        );
        return first.nextCursor as string;
      })();

      // when
      const result = await orchestrator.search(
        USER_ID,
        { query: '커리어', topicIds: [], cursor, limit: 1 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.items).toHaveLength(0);
      expect(result.fallback).toBeNull();
      expect(topicService.findVisibleRelatedByName).not.toHaveBeenCalled();
    });
  });
  describe('시리즈 카드 스위치 켬(SERIES_EXPLORE_CARDS_ENABLED=true — KAN-134 확정 설계 4번)', () => {
    const SERIES_ID = '77777777-7777-4777-8777-777777777777';
    const E1 = 'e1111111-1111-4111-8111-111111111111';
    const E2 = 'e2222222-2222-4222-8222-222222222222';
    const E3 = 'e3333333-3333-4333-8333-333333333333';
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
      );
    });

    it('주제 목록 — 시리즈 편들이 가장 높은 순위 편 자리의 카드 하나가 되고, 콘텐츠 행에는 type: content 가 붙는다', async () => {
      // given — 순위: 2화 · 단일 · 1화 · 3화
      contentService.findExplorePage.mockResolvedValue({
        items: [
          { content: episode(E2, 2), playCount: 9 },
          {
            content: buildContent(CONTENT_ID, { seriesId: null }),
            playCount: 5,
          },
          { content: episode(E1, 1), playCount: 3 },
          { content: episode(E3, 3), playCount: 1 },
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

    it('다음 커서는 마지막으로 훑은 편 위치와 이미 낸 시리즈(g)를 담고, 다음 페이지는 그 시리즈 편을 건너뛴다', async () => {
      // given — 1페이지(limit 1): 2화(카드)만 낸다
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
      expect(first.hasNext).toBe(true);
      expect(readSeenSeries(first.nextCursor ?? '')).toEqual([SERIES_ID]);
      expect(decodeExploreCursor(first.nextCursor ?? '', [TOPIC_ID])).toEqual({
        playCount: 9,
        publishedAt: episode(E2, 2).publishedAt,
        id: E2,
      });

      // given — 2페이지: 1화(건너뜀) · 단일
      contentService.findExplorePage.mockResolvedValueOnce({
        items: [
          { content: episode(E1, 1), playCount: 3 },
          {
            content: buildContent(CONTENT_ID, { seriesId: null }),
            playCount: 2,
          },
        ],
        hasNext: false,
      });

      // when
      const second = await cards.getContents(
        USER_ID,
        { topicIds: [TOPIC_ID], cursor: first.nextCursor, limit: 1 },
        NOW,
        UserMarket.KR,
      );

      // then — 시리즈는 다시 나오지 않는다
      expect(second.items).toHaveLength(1);
      expect(asContent(second.items[0]).content.id).toBe(CONTENT_ID);
      expect(second.hasNext).toBe(false);
      expect(second.nextCursor).toBeNull();
    });

    it('검색은 시리즈 제목 일치도 묻고 같은 규칙으로 접는다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [
          {
            content: episode(E1, 1),
            score: 10,
            titleSimilarity: 0.9,
            playCount: 3,
          },
          {
            content: episode(E2, 2),
            score: 10,
            titleSimilarity: 0.8,
            playCount: 2,
          },
        ],
        hasNext: false,
      });

      // when
      const result = await cards.search(
        USER_ID,
        { query: '시리즈', topicIds: [], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentService.findSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({ matchSeriesTitle: true }),
      );
      expect(result.items).toEqual([{ type: 'series', card }]);
      expect(searchQueryLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ resultCount: 1, resultContentIds: [E1] }),
        NOW,
      );
    });

    it('스위치가 꺼져 있으면 같은 입력에 편마다 한 줄이고 type 키가 없으며 시리즈 제목 일치를 묻지 않는다', async () => {
      // given
      contentService.findSearchPage.mockResolvedValue({
        items: [
          {
            content: episode(E1, 1),
            score: 10,
            titleSimilarity: 0.9,
            playCount: 3,
          },
          {
            content: episode(E2, 2),
            score: 10,
            titleSimilarity: 0.8,
            playCount: 2,
          },
        ],
        hasNext: false,
      });

      // when
      const result = await orchestrator.search(
        USER_ID,
        { query: '시리즈', topicIds: [], cursor: null, limit: 20 },
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => !('type' in item))).toBe(true);
      expect(contentService.findSearchPage).toHaveBeenCalledWith(
        expect.not.objectContaining({ matchSeriesTitle: true }),
      );
    });

    it('피드 섹션 — 넉넉히 읽어 접은 뒤 10칸으로 자른다', async () => {
      // given — 새로 나온 콘텐츠 30건 중 시리즈 편 12건(앞쪽) + 단일 18건
      const recent = [
        ...Array.from({ length: 12 }, (_, index) =>
          episode(
            `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
            index + 1,
          ),
        ),
        ...Array.from({ length: 18 }, (_, index) =>
          buildContent(
            `10000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
            {
              seriesId: null,
            },
          ),
        ),
      ];
      contentService.findRecent.mockResolvedValue(recent);

      // when
      const result = await cards.getFeed(USER_ID, NOW, UserMarket.KR);

      // then
      expect(contentService.findRecent).toHaveBeenCalledWith(
        30,
        NOW,
        UserMarket.KR,
      );
      const section = result.sections.find(
        (candidate) => candidate.key === ExploreSectionKey.NEW,
      );
      expect(section?.items).toHaveLength(10);
      expect(section?.items[0]).toEqual({ type: 'series', card });
      expect(
        section?.items.filter((item) => item.type === 'series'),
      ).toHaveLength(1);
    });
  });
});
