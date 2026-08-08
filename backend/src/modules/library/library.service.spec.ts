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
    sourceFilter: null,
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
      insertIfAbsent: jest.fn().mockResolvedValue(true),
      reactivateById: jest.fn(),
      findByUserIdAndContentIdWithDeleted: jest.fn().mockResolvedValue(null),
      findAllActiveByUserIdAndContentIds: jest.fn().mockResolvedValue([]),
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

  describe('save', () => {
    it('담긴 적 없는 콘텐츠는 새로 적립하고 새로 담겼음을 알린다', async () => {
      // given — 응답 상태가 201로 갈린다 (explore-api.md 4.3)
      repository.findByUserIdAndContentIdWithDeleted
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          buildItem({ source: LibraryItemSource.SAVE, addedAt: NOW }),
        );

      // when
      const result = await service.save(USER_ID, CONTENT_ID, NOW);

      // then
      expect(repository.insertIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          source: LibraryItemSource.SAVE,
          status: LibraryItemStatus.UNPLAYED,
          addedAt: NOW,
        }),
        undefined,
      );
      expect(result.created).toBe(true);
    });

    it('이미 담긴 콘텐츠는 적립 시각을 갱신하지 않는다', async () => {
      // given — 다시 담아도 목록 순서가 바뀌면 안 된다
      repository.findByUserIdAndContentIdWithDeleted.mockResolvedValue(
        buildItem({ source: LibraryItemSource.DRIP }),
      );

      // when
      const result = await service.save(USER_ID, CONTENT_ID, NOW);

      // then
      expect(result.item.addedAt).toBe(ADDED_AT);
      expect(result.item.source).toBe(LibraryItemSource.DRIP);
      expect(result.created).toBe(false);
      // 상태가 바뀌지 않았음을 호출부에 알린다 — 신호를 남길 근거가 없다
      expect(result.reactivated).toBe(false);
      expect(repository.reactivateById).not.toHaveBeenCalled();
    });

    it('지웠던 콘텐츠를 다시 담으면 되살리고 적립 시각을 새로 찍는다', async () => {
      // given — 재담기는 새 담기 조작이다(삭제 실행 취소와 되돌린 대상이 다르다)
      repository.findByUserIdAndContentIdWithDeleted.mockResolvedValue(
        buildItem({ deletedAt: new Date('2026-08-04T00:00:00.000Z') }),
      );

      // when
      const result = await service.save(USER_ID, CONTENT_ID, NOW);

      // then
      expect(repository.reactivateById).toHaveBeenCalledWith(
        'item-1',
        NOW,
        LibraryItemSource.SAVE,
        undefined,
      );
      expect(result.item.addedAt).toBe(NOW);
      expect(result.item.deletedAt).toBeNull();
      // 행을 새로 만들지 않았으므로 201은 아니지만, 상태는 바뀌었으므로 신호는 남겨야 한다
      expect(result.created).toBe(false);
      expect(result.reactivated).toBe(true);
    });

    it('동시 요청에 져서 행이 이미 있어도 성공으로 흡수한다', async () => {
      // given — 재시도한 사용자에게 실패로 보이면 안 된다 (architecture.md 8.4)
      repository.insertIfAbsent.mockResolvedValue(false);
      repository.findByUserIdAndContentIdWithDeleted
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildItem());

      // when
      const result = await service.save(USER_ID, CONTENT_ID, NOW);

      // then
      expect(result.created).toBe(false);
      expect(result.item.id).toBe('item-1');
    });
  });

  describe('unsave', () => {
    it('담겨 있으면 소프트 삭제하고 해제됐음을 알린다', async () => {
      // given
      repository.findByUserIdAndContentId.mockResolvedValue(buildItem());

      // when
      const removed = await service.unsave(USER_ID, CONTENT_ID, NOW);

      // then
      expect(repository.softDeleteById).toHaveBeenCalledWith(
        'item-1',
        NOW,
        undefined,
      );
      expect(removed).toBe(true);
    });

    it('담긴 적 없으면 실패시키지 않고 해제가 없었음을 알린다', async () => {
      // given — 없던 담기의 해제로 영구 제외와 부정 신호가 쌓이면 안 된다

      // when
      const removed = await service.unsave(USER_ID, CONTENT_ID, NOW);

      // then
      expect(removed).toBe(false);
      expect(repository.softDeleteById).not.toHaveBeenCalled();
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
