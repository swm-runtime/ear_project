import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemFilter,
  LibraryItemSort,
  LibraryItemSource,
  LibraryItemSourceFilter,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';

import { decodeLibraryCursor } from './library-screen.cursor';
import { LibraryScreenOrchestrator } from './library-screen.orchestrator';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const ADDED_AT = new Date('2026-08-03T21:10:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const OTHER_CONTENT_ID = 'bbbbbbbb-1111-4111-8111-111111111111';

const QUOTA = {
  dailyPlayLimit: 2,
  dailyPlayCount: 1,
  serviceDate: '2026-08-05',
};

const LIST_QUERY = {
  filter: LibraryItemFilter.ALL,
  sourceFilter: null,
  topicIds: [],
  sort: LibraryItemSort.ADDED_DESC,
  cursor: null,
  limit: 20,
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
    ...overrides,
  } as Content;
}

function buildItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-1',
    userId: USER_ID,
    contentId: CONTENT_ID,
    source: LibraryItemSource.DRIP,
    status: LibraryItemStatus.IN_PROGRESS,
    addedAt: ADDED_AT,
    lastPlayedAt: null,
    completedAt: null,
    deletedAt: null,
    content: buildContent(CONTENT_ID),
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

describe('LibraryScreenOrchestrator', () => {
  let orchestrator: LibraryScreenOrchestrator;
  let libraryService: jest.Mocked<LibraryService>;
  let playbackService: jest.Mocked<PlaybackService>;
  let contentService: jest.Mocked<ContentService>;
  let dripExclusionService: jest.Mocked<DripExclusionService>;

  beforeEach(() => {
    libraryService = {
      findPage: jest.fn().mockResolvedValue({ items: [], hasNext: false }),
      findVisibleContentIds: jest.fn().mockResolvedValue([]),
      findResumeTarget: jest.fn().mockResolvedValue(null),
      getOwnedItem: jest.fn(),
      getOwnedItemWithDeleted: jest.fn(),
      completeItem: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn().mockImplementation((item: LibraryItem) => item),
    } as unknown as jest.Mocked<LibraryService>;

    playbackService = {
      findProgress: jest.fn().mockResolvedValue(null),
      findProgresses: jest.fn().mockResolvedValue([]),
      findStartedContentIds: jest.fn().mockResolvedValue([]),
      findCountedContentIds: jest.fn().mockResolvedValue(new Set<string>()),
      buildQuotaForUser: jest.fn().mockResolvedValue(QUOTA),
      recordSignal: jest.fn(),
    } as unknown as jest.Mocked<PlaybackService>;

    contentService = {
      findTopicViews: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentService>;

    dripExclusionService = {
      exclude: jest.fn(),
    } as unknown as jest.Mocked<DripExclusionService>;

    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    orchestrator = new LibraryScreenOrchestrator(
      libraryService,
      playbackService,
      contentService,
      dripExclusionService,
      dataSource,
    );
  });

  describe('getItems', () => {
    it('목록에 잔여 재생 표시값을 함께 실어 보낸다', async () => {
      // given — 왕복이 두 번이면 목록과 잔여 표시의 시점이 어긋난다

      // when
      const result = await orchestrator.getItems(USER_ID, LIST_QUERY, NOW);

      // then
      expect(result.quota).toEqual(QUOTA);
    });

    it('다음 페이지가 있으면 마지막 항목 위치로 커서를 발급한다', async () => {
      // given
      libraryService.findPage.mockResolvedValue({
        items: [buildItem({ id: 'item-1' }), buildItem({ id: 'item-2' })],
        hasNext: true,
      });

      // when
      const result = await orchestrator.getItems(USER_ID, LIST_QUERY, NOW);

      // then
      expect(result.nextCursor).not.toBeNull();
      expect(
        decodeLibraryCursor(result.nextCursor as string, {
          filter: LIST_QUERY.filter,
          sourceFilter: LIST_QUERY.sourceFilter,
          sort: LIST_QUERY.sort,
          topicIds: LIST_QUERY.topicIds,
        }),
      ).toEqual({ addedAt: ADDED_AT, id: 'item-2' });
    });

    it('발급한 커서에 출처 필터를 담는다', async () => {
      // given — 담기지 않으면 출처만 바꾼 다음 페이지 요청이 그대로 통과한다
      libraryService.findPage.mockResolvedValue({
        items: [buildItem({ id: 'item-1' })],
        hasNext: true,
      });

      // when
      const result = await orchestrator.getItems(
        USER_ID,
        { ...LIST_QUERY, sourceFilter: LibraryItemSourceFilter.DRIP },
        NOW,
      );

      // then
      expect(() =>
        decodeLibraryCursor(result.nextCursor as string, {
          filter: LIST_QUERY.filter,
          sourceFilter: LibraryItemSourceFilter.SAVE,
          sort: LIST_QUERY.sort,
          topicIds: LIST_QUERY.topicIds,
        }),
      ).toThrow();
    });

    it('출처 필터를 Service 조회 조건에 그대로 넘긴다', async () => {
      // given — 판정은 Repository가 하고 Orchestrator는 조합만 한다
      libraryService.findPage.mockResolvedValue({ items: [], hasNext: false });

      // when
      await orchestrator.getItems(
        USER_ID,
        { ...LIST_QUERY, sourceFilter: LibraryItemSourceFilter.SAVE },
        NOW,
      );

      // then
      expect(libraryService.findPage).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFilter: LibraryItemSourceFilter.SAVE,
        }),
      );
    });

    it('다음 페이지가 없으면 커서를 발급하지 않는다', async () => {
      // given
      libraryService.findPage.mockResolvedValue({
        items: [buildItem()],
        hasNext: false,
      });

      // when
      const result = await orchestrator.getItems(USER_ID, LIST_QUERY, NOW);

      // then
      expect(result.nextCursor).toBeNull();
    });

    it('오늘 이미 카운트된 콘텐츠를 항목에 표시한다', async () => {
      // given — 팝업이 탭한 직후 즉시 뜨려면 이 값이 목록에 있어야 한다
      libraryService.findPage.mockResolvedValue({
        items: [buildItem()],
        hasNext: false,
      });
      playbackService.findCountedContentIds.mockResolvedValue(
        new Set([CONTENT_ID]),
      );

      // when
      const result = await orchestrator.getItems(USER_ID, LIST_QUERY, NOW);

      // then
      expect(result.items[0].isCountedToday).toBe(true);
    });

    it('재생 이력이 없으면 진행률을 0으로 채우지 않고 비운다', async () => {
      // given
      libraryService.findPage.mockResolvedValue({
        items: [buildItem()],
        hasNext: false,
      });

      // when
      const result = await orchestrator.getItems(USER_ID, LIST_QUERY, NOW);

      // then
      expect(result.items[0].progress).toBeNull();
    });
  });

  describe('getTopics', () => {
    it('라이브러리에 담긴 콘텐츠의 주제를 개수와 함께 내려준다', async () => {
      // given
      libraryService.findVisibleContentIds.mockResolvedValue([
        CONTENT_ID,
        OTHER_CONTENT_ID,
      ]);
      contentService.findTopicViews.mockResolvedValue([
        { contentId: CONTENT_ID, topicId: 'topic-1', name: '커리어' },
        { contentId: OTHER_CONTENT_ID, topicId: 'topic-1', name: '커리어' },
        { contentId: OTHER_CONTENT_ID, topicId: 'topic-2', name: '생산성' },
      ]);

      // when
      const topics = await orchestrator.getTopics(USER_ID);

      // then
      expect(topics).toEqual([
        { topicId: 'topic-1', name: '커리어', itemCount: 2 },
        { topicId: 'topic-2', name: '생산성', itemCount: 1 },
      ]);
    });

    it('담긴 항목이 없으면 빈 목록을 내려준다', async () => {
      // given — 빈 라이브러리는 정상 상태다. 404가 아니다

      // when
      const topics = await orchestrator.getTopics(USER_ID);

      // then
      expect(topics).toEqual([]);
    });
  });

  describe('getResumeTarget', () => {
    it('이어들을 콘텐츠가 없어도 잔여 재생 표시값은 함께 내려준다', async () => {
      // given

      // when
      const result = await orchestrator.getResumeTarget(USER_ID, NOW);

      // then
      expect(result.resumeTarget).toBeNull();
      expect(result.quota).toEqual(QUOTA);
    });

    it('재생 위치가 있는 콘텐츠 중에서만 복원 대상을 찾는다', async () => {
      // given — 위치가 0이면 처음부터 듣는 것과 같다
      playbackService.findStartedContentIds.mockResolvedValue([CONTENT_ID]);

      // when
      await orchestrator.getResumeTarget(USER_ID, NOW);

      // then
      expect(libraryService.findResumeTarget).toHaveBeenCalledWith(USER_ID, [
        CONTENT_ID,
      ]);
    });
  });

  describe('completeItem', () => {
    it('재생 이력이 없으면 도달 위치 0으로 판정을 맡긴다', async () => {
      // given
      const item = buildItem();
      libraryService.getOwnedItem.mockResolvedValue(item);

      // when
      await orchestrator.completeItem(USER_ID, item.id, NOW);

      // then
      expect(libraryService.completeItem).toHaveBeenCalledWith(
        item,
        0,
        NOW,
        expect.anything(),
      );
    });
  });

  describe('deleteItem', () => {
    it('삭제하면 드립 영구 제외와 삭제 신호를 함께 적재한다', async () => {
      // given
      const item = buildItem();
      libraryService.getOwnedItemWithDeleted.mockResolvedValue(item);

      // when
      await orchestrator.deleteItem(USER_ID, item.id, NOW);

      // then
      expect(libraryService.softDelete).toHaveBeenCalledWith(
        item,
        NOW,
        expect.anything(),
      );
      expect(dripExclusionService.exclude).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        DripExclusionReason.LIBRARY_DELETE,
        NOW,
        expect.anything(),
      );
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        UserSignalAction.DELETE,
        expect.anything(),
      );
    });

    it('이미 삭제된 항목이면 신호를 다시 쌓지 않는다', async () => {
      // given — 오프라인 큐가 같은 삭제를 다시 보낼 수 있다
      libraryService.getOwnedItemWithDeleted.mockResolvedValue(
        buildItem({ deletedAt: NOW }),
      );

      // when
      await orchestrator.deleteItem(USER_ID, 'item-1', NOW);

      // then
      expect(playbackService.recordSignal).not.toHaveBeenCalled();
      expect(libraryService.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('restoreItem', () => {
    it('삭제해 둔 사이 회수된 콘텐츠는 복구하지 않는다', async () => {
      // given — 복구해도 목록에 나타나지 않는다
      libraryService.getOwnedItemWithDeleted.mockResolvedValue(
        buildItem({
          deletedAt: NOW,
          content: buildContent(CONTENT_ID, {
            status: ContentStatus.WITHDRAWN,
          }),
        }),
      );

      // when
      const error = await catchError(
        orchestrator.restoreItem(USER_ID, 'item-1'),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.CONTENT_WITHDRAWN);
      expect(libraryService.restore).not.toHaveBeenCalled();
    });

    it('복구해도 드립 영구 제외 행은 지우지 않는다', async () => {
      // given — 지우면 이미 들은 콘텐츠가 드립으로 다시 온다
      libraryService.getOwnedItemWithDeleted.mockResolvedValue(
        buildItem({ deletedAt: NOW }),
      );

      // when
      await orchestrator.restoreItem(USER_ID, 'item-1');

      // then
      expect(dripExclusionService.exclude).not.toHaveBeenCalled();
    });
  });
});
