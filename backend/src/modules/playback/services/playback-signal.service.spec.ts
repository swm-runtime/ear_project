import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';

import { UserSignalAction } from '../playback.enum';
import { SourceLinkClickRepository } from '../repositories/source-link-click.repository';
import { PlaybackService } from './playback.service';
import { PlaybackSignalService } from './playback-signal.service';

const USER_ID = 'user-1';
const CONTENT_ID = 'content-1';

/** 콘텐츠·라이브러리·적재 대상을 메모리로 — 적재 여부 판정은 진짜 Service가 한다 */
class SignalWorld {
  readonly contentIds = new Set<string>();
  readonly libraryItems: Array<
    Pick<LibraryItem, 'userId' | 'contentId' | 'status'>
  > = [];
  readonly signals: Array<{
    userId: string;
    contentId: string;
    action: UserSignalAction;
  }> = [];
  readonly sourceLinkClicks: Array<{ userId: string; contentId: string }> = [];

  readonly contentService = {
    getById: (contentId: string) => {
      if (!this.contentIds.has(contentId)) {
        return Promise.reject(
          new BusinessNotFoundException({
            errorCode: ErrorCode.CONTENT_NOT_FOUND,
            message: '콘텐츠를 찾을 수 없어요',
          }),
        );
      }
      return Promise.resolve({ id: contentId });
    },
  };

  readonly libraryService = {
    findItemByContentId: (userId: string, contentId: string) =>
      Promise.resolve(
        this.libraryItems.find(
          (item) => item.userId === userId && item.contentId === contentId,
        ) ?? null,
      ),
  };

  readonly playbackService = {
    recordSignal: (
      userId: string,
      contentId: string,
      action: UserSignalAction,
    ) => {
      this.signals.push({ userId, contentId, action });
      return Promise.resolve();
    },
  };

  readonly sourceLinkClickRepository = {
    insert: (userId: string, contentId: string) => {
      this.sourceLinkClicks.push({ userId, contentId });
      return Promise.resolve();
    },
  };
}

function setup() {
  const world = new SignalWorld();
  const service = new PlaybackSignalService(
    world.playbackService as unknown as PlaybackService,
    world.contentService as unknown as ContentService,
    world.libraryService as unknown as LibraryService,
    world.sourceLinkClickRepository as unknown as SourceLinkClickRepository,
  );
  return { world, service };
}

async function expectContentNotFound(work: Promise<unknown>): Promise<void> {
  const error = await work.then(
    () => {
      throw new Error('expected CONTENT_NOT_FOUND but resolved');
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(BusinessNotFoundException);
  expect((error as BusinessNotFoundException).errorCode).toBe(
    ErrorCode.CONTENT_NOT_FOUND,
  );
}

describe('PlaybackSignalService', () => {
  describe('recordReplay', () => {
    it('완료 상태의 콘텐츠면 replay 신호를 한 건 적재한다', async () => {
      // given
      const { world, service } = setup();
      world.contentIds.add(CONTENT_ID);
      world.libraryItems.push({
        userId: USER_ID,
        contentId: CONTENT_ID,
        status: LibraryItemStatus.COMPLETED,
      });

      // when
      await service.recordReplay(USER_ID, CONTENT_ID);

      // then
      expect(world.signals).toEqual([
        {
          userId: USER_ID,
          contentId: CONTENT_ID,
          action: UserSignalAction.REPLAY,
        },
      ]);
    });

    it.each([LibraryItemStatus.UNPLAYED, LibraryItemStatus.IN_PROGRESS])(
      '%s 상태면 적재하지 않고 오류 없이 끝난다',
      async (status) => {
        // given
        const { world, service } = setup();
        world.contentIds.add(CONTENT_ID);
        world.libraryItems.push({
          userId: USER_ID,
          contentId: CONTENT_ID,
          status,
        });

        // when
        await service.recordReplay(USER_ID, CONTENT_ID);

        // then
        expect(world.signals).toHaveLength(0);
      },
    );

    it('라이브러리에 없는 콘텐츠면 적재하지 않고 오류 없이 끝난다', async () => {
      // given
      const { world, service } = setup();
      world.contentIds.add(CONTENT_ID);

      // when
      await service.recordReplay(USER_ID, CONTENT_ID);

      // then
      expect(world.signals).toHaveLength(0);
    });

    it('다른 사용자가 완료한 콘텐츠로는 적재하지 않는다', async () => {
      // given
      const { world, service } = setup();
      world.contentIds.add(CONTENT_ID);
      world.libraryItems.push({
        userId: 'other-user',
        contentId: CONTENT_ID,
        status: LibraryItemStatus.COMPLETED,
      });

      // when
      await service.recordReplay(USER_ID, CONTENT_ID);

      // then
      expect(world.signals).toHaveLength(0);
    });

    it('없는 콘텐츠면 404 CONTENT_NOT_FOUND 이고 적재하지 않는다', async () => {
      // given
      const { world, service } = setup();
      world.libraryItems.push({
        userId: USER_ID,
        contentId: CONTENT_ID,
        status: LibraryItemStatus.COMPLETED,
      });

      // when / then
      await expectContentNotFound(service.recordReplay(USER_ID, CONTENT_ID));
      expect(world.signals).toHaveLength(0);
    });
  });

  describe('recordSourceLinkClick', () => {
    it('탭할 때마다 한 행씩 적재한다', async () => {
      // given
      const { world, service } = setup();
      world.contentIds.add(CONTENT_ID);

      // when
      await service.recordSourceLinkClick(USER_ID, CONTENT_ID);
      await service.recordSourceLinkClick(USER_ID, CONTENT_ID);

      // then
      expect(world.sourceLinkClicks).toHaveLength(2);
    });

    it('라이브러리에 없는 콘텐츠여도 적재한다', async () => {
      // given — 탐색 화면에서 담기 전에 탭할 수 있다
      const { world, service } = setup();
      world.contentIds.add(CONTENT_ID);

      // when
      await service.recordSourceLinkClick(USER_ID, CONTENT_ID);

      // then
      expect(world.sourceLinkClicks).toEqual([
        { userId: USER_ID, contentId: CONTENT_ID },
      ]);
    });

    it('없는 콘텐츠면 404 CONTENT_NOT_FOUND 이고 적재하지 않는다', async () => {
      // given
      const { world, service } = setup();

      // when / then
      await expectContentNotFound(
        service.recordSourceLinkClick(USER_ID, CONTENT_ID),
      );
      expect(world.sourceLinkClicks).toHaveLength(0);
    });
  });
});
