import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
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

import { decodeExploreCursor } from './explore.cursor';
import { ExploreSectionKey, SaveReason } from './explore.enum';
import { ExploreOrchestrator } from './explore.orchestrator';

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

describe('ExploreOrchestrator', () => {
  let orchestrator: ExploreOrchestrator;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
  let playbackService: jest.Mocked<PlaybackService>;
  let userInterestService: jest.Mocked<UserInterestService>;
  let topicService: jest.Mocked<TopicService>;
  let dripExclusionService: jest.Mocked<DripExclusionService>;

  beforeEach(() => {
    contentService = {
      findCandidates: jest.fn().mockResolvedValue([]),
      findRecent: jest.fn().mockResolvedValue([]),
      findPopular: jest.fn().mockResolvedValue([]),
      findExplorePage: jest
        .fn()
        .mockResolvedValue({ items: [], hasNext: false }),
      findTopicViews: jest.fn().mockResolvedValue([]),
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
    } as unknown as jest.Mocked<UserInterestService>;

    topicService = {
      findAllByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TopicService>;

    dripExclusionService = {
      exclude: jest.fn(),
    } as unknown as jest.Mocked<DripExclusionService>;

    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    orchestrator = new ExploreOrchestrator(
      contentService,
      libraryService,
      playbackService,
      userInterestService,
      topicService,
      dripExclusionService,
      dataSource,
    );
  });

  describe('getFeed', () => {
    it('관심 주제가 있으면 관심사 섹션이 피드에 포함된다', async () => {
      // given — 완청 3건 이상이라 콜드스타트가 아니다
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      playbackService.countSignals.mockResolvedValue(5);
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW);

      // then
      expect(result.sections[0].key).toBe(ExploreSectionKey.INTEREST);
      expect(result.sections[0].title).toBe('관심사에 맞는 추천');
    });

    it('신호가 부족한 신규 사용자에게는 인기·신규 섹션을 앞에 둔다', async () => {
      // given — 콜드스타트(FR-17)는 완청 3건 미만이다
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      playbackService.countSignals.mockResolvedValue(0);
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);
      contentService.findPopular.mockResolvedValue([
        buildContent(OTHER_CONTENT_ID),
      ]);
      contentService.findRecent.mockResolvedValue([
        buildContent(OTHER_CONTENT_ID),
      ]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW);

      // then
      expect(result.sections.map((section) => section.key).slice(0, 2)).toEqual(
        [ExploreSectionKey.POPULAR, ExploreSectionKey.NEW],
      );
    });

    it('콜드스타트에서는 신호를 읽지 않는다', async () => {
      // given — 신호 기반 항목을 사실상 0으로 둔다(`drip-scheduling.md` 4.4)
      userInterestService.findActiveTopicIds.mockResolvedValue([TOPIC_ID]);
      playbackService.countSignals.mockResolvedValue(0);
      contentService.findCandidates.mockResolvedValue([
        buildContent(CONTENT_ID),
      ]);

      // when
      await orchestrator.getFeed(USER_ID, NOW);

      // then
      expect(playbackService.findRecentSignals).not.toHaveBeenCalled();
    });

    it('이미 라이브러리에 있는 콘텐츠도 담김 표시를 달고 그대로 노출된다', async () => {
      // given — 초기 콘텐츠 풀이 작아 제외하면 피드가 빈다(`explore.md` 4.1)
      contentService.findRecent.mockResolvedValue([buildContent(CONTENT_ID)]);
      libraryService.findActiveItems.mockResolvedValue([buildLibraryItem()]);

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW);

      // then
      const [item] = result.sections[0].items;
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
      const result = await orchestrator.getFeed(USER_ID, NOW);

      // then
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].key).toBe(ExploreSectionKey.NEW);
    });

    it('노출할 콘텐츠가 하나도 없으면 빈 배열을 내려준다', async () => {
      // given — 빈 피드는 정상 상태다. 404가 아니다

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW);

      // then
      expect(result.sections).toEqual([]);
    });

    it('피드에 잔여 재생 표시값을 함께 실어 보낸다', async () => {
      // given — 피드를 여는 시점이 곧 이 값을 갱신하는 시점이다

      // when
      const result = await orchestrator.getFeed(USER_ID, NOW);

      // then
      expect(result.quota).toEqual(QUOTA);
    });

    it('인기 섹션은 직전 확정 주의 집계를 기준으로 조회한다', async () => {
      // given — 진행 중인 구간을 쓰면 주초에 표본이 부족해 랭킹이 무너진다

      // when
      await orchestrator.getFeed(USER_ID, NOW);

      // then
      expect(contentService.findPopular).toHaveBeenCalledWith(
        '2026-07-27',
        expect.any(Number),
        NOW,
      );
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
      const result = await orchestrator.getFeed(USER_ID, NOW);
      const topicGroup = result.sections.find(
        (section) => section.key === ExploreSectionKey.TOPIC_GROUP,
      );

      // then
      expect(topicGroup?.title).toBe('커리어');
      expect(topicGroup?.topic).toEqual({ id: TOPIC_ID, name: '커리어' });
    });
  });

  describe('getContents', () => {
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
});
