import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { Content } from '@/modules/content/entities/content.entity';

import { LibraryItem } from './library-item.entity';
import { LibraryItemRepository } from './library-item.repository';
import {
  LibraryItemFilter,
  LibraryItemSort,
  LibraryItemSource,
  LibraryItemStatus,
} from './library.enum';
import { LibraryService } from './library.service';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const ADDED_AT = new Date('2026-08-03T21:10:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

/** 10분짜리 콘텐츠 — 완청 기준선은 540초다 */
const DURATION_SEC = 600;
const REACHED_THRESHOLD_SEC = 540;

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
    content: { id: CONTENT_ID, durationSec: DURATION_SEC } as Content,
    ...overrides,
  } as LibraryItem;
}

function buildPageQuery(limit: number) {
  return {
    userId: USER_ID,
    filter: LibraryItemFilter.ALL,
    topicIds: [],
    sort: LibraryItemSort.ADDED_DESC,
    cursor: null,
    limit,
  };
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

describe('LibraryService', () => {
  let service: LibraryService;
  let repository: jest.Mocked<LibraryItemRepository>;

  beforeEach(() => {
    repository = {
      findPage: jest.fn().mockResolvedValue([]),
      findAllVisibleContentIdsByUserId: jest.fn().mockResolvedValue([]),
      findLatestPlayedAmongContentIds: jest.fn().mockResolvedValue(null),
      findByIdAndUserId: jest.fn().mockResolvedValue(null),
      findByIdAndUserIdWithDeleted: jest.fn().mockResolvedValue(null),
      findByUserIdAndContentId: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((item: LibraryItem) => item),
      softDeleteById: jest.fn(),
      restoreById: jest.fn(),
      insertIgnoringConflicts: jest.fn(),
      findAllByUserIdAndContentIds: jest.fn().mockResolvedValue([]),
      findAllContentIdsByUserId: jest.fn().mockResolvedValue([]),
      countByUserIdAndSource: jest.fn(),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<LibraryItemRepository>;

    service = new LibraryService(repository);
  });

  describe('findPage', () => {
    it('한 건을 더 읽어 왔으면 잘라내고 다음 페이지가 있다고 알린다', async () => {
      // given — Repository는 limit + 1건을 읽어 온다
      repository.findPage.mockResolvedValue([
        buildItem({ id: 'item-1' }),
        buildItem({ id: 'item-2' }),
        buildItem({ id: 'item-3' }),
      ]);

      // when
      const page = await service.findPage(buildPageQuery(2));

      // then
      expect(page.items).toHaveLength(2);
      expect(page.hasNext).toBe(true);
    });

    it('읽어 온 건수가 상한 이하면 다음 페이지가 없다', async () => {
      // given
      repository.findPage.mockResolvedValue([buildItem()]);

      // when
      const page = await service.findPage(buildPageQuery(2));

      // then
      expect(page.items).toHaveLength(1);
      expect(page.hasNext).toBe(false);
    });
  });

  describe('completeItem', () => {
    it('도달 위치가 90%에 못 미치면 상태를 바꾸지 않고 거절한다', async () => {
      // given
      const item = buildItem();

      // when
      const error = await catchError(
        service.completeItem(item, REACHED_THRESHOLD_SEC - 1, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.LIBRARY_COMPLETION_NOT_REACHED);
      expect(item.status).toBe(LibraryItemStatus.IN_PROGRESS);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('도달 위치가 90% 이상이면 완료로 전이한다', async () => {
      // given
      const item = buildItem();

      // when
      const completed = await service.completeItem(
        item,
        REACHED_THRESHOLD_SEC,
        NOW,
      );

      // then
      expect(completed.status).toBe(LibraryItemStatus.COMPLETED);
      expect(completed.completedAt).toEqual(NOW);
    });

    it('이미 완료된 항목은 되감아 다시 들어도 완료 시각을 유지한다', async () => {
      // given
      const completedAt = new Date('2026-08-04T00:30:42.000Z');
      const item = buildItem({
        status: LibraryItemStatus.COMPLETED,
        completedAt,
      });

      // when
      const result = await service.completeItem(item, 0, NOW);

      // then
      expect(result.completedAt).toEqual(completedAt);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('콘텐츠 길이를 알 수 없으면 재생 종료만으로 완료 처리한다', async () => {
      // given — 업로드 검증이 길이 0을 거부하므로 정상 경로에서는 생기지 않는 방어다
      const item = buildItem({
        content: { id: CONTENT_ID, durationSec: 0 } as Content,
      });

      // when
      const result = await service.completeItem(item, 0, NOW);

      // then
      expect(result.status).toBe(LibraryItemStatus.COMPLETED);
    });
  });

  describe('markPlayStarted', () => {
    it('미청취 항목을 재생하면 듣는 중으로 전이한다', async () => {
      // given
      repository.findByUserIdAndContentId.mockResolvedValue(
        buildItem({ status: LibraryItemStatus.UNPLAYED }),
      );

      // when
      const item = await service.markPlayStarted(USER_ID, CONTENT_ID, NOW);

      // then
      expect(item?.status).toBe(LibraryItemStatus.IN_PROGRESS);
      expect(item?.lastPlayedAt).toEqual(NOW);
    });

    it('완청한 콘텐츠를 다시 재생해도 상태를 되돌리지 않는다', async () => {
      // given
      repository.findByUserIdAndContentId.mockResolvedValue(
        buildItem({ status: LibraryItemStatus.COMPLETED }),
      );

      // when
      const item = await service.markPlayStarted(USER_ID, CONTENT_ID, NOW);

      // then
      expect(item?.status).toBe(LibraryItemStatus.COMPLETED);
    });

    it('라이브러리에 없는 콘텐츠는 행을 만들지 않는다', async () => {
      // given — 담기는 사용자의 명시적 조작이다

      // when
      const item = await service.markPlayStarted(USER_ID, CONTENT_ID, NOW);

      // then
      expect(item).toBeNull();
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('이미 삭제된 항목에는 아무 것도 하지 않는다', async () => {
      // given — 오프라인 큐가 같은 삭제를 다시 보낼 수 있다
      const item = buildItem({ deletedAt: NOW });

      // when
      await service.softDelete(item, NOW);

      // then
      expect(repository.softDeleteById).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('복구해도 적립 시각과 상태를 유지한다', async () => {
      // given — 되돌린 것은 삭제이지 적립 시각이 아니다
      const item = buildItem({ deletedAt: NOW });

      // when
      const restored = await service.restore(item);

      // then
      expect(restored.addedAt).toEqual(ADDED_AT);
      expect(restored.status).toBe(LibraryItemStatus.IN_PROGRESS);
      expect(restored.deletedAt).toBeNull();
    });

    it('삭제되지 않은 항목에 호출하면 그대로 둔다', async () => {
      // given — 큐 재전송으로 같은 복구가 두 번 도착할 수 있다
      const item = buildItem();

      // when
      await service.restore(item);

      // then
      expect(repository.restoreById).not.toHaveBeenCalled();
    });
  });

  describe('getOwnedItem', () => {
    it('남의 항목이면 존재를 알리지 않고 찾을 수 없음으로 응답한다', async () => {
      // given — 403은 "그 항목이 존재한다"를 알려준다 (library-api.md 7장)

      // when
      const error = await catchError(service.getOwnedItem('item-1', USER_ID));

      // then
      expect(error.errorCode).toBe(ErrorCode.LIBRARY_ITEM_NOT_FOUND);
    });
  });
});
