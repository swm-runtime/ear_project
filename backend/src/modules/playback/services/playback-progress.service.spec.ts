import { DataSource } from 'typeorm';

import { BusinessConflictException } from '@/common/exceptions/business-conflict.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';

import { UserSignalAction } from '../playback.enum';
import { PlaybackProgressService } from './playback-progress.service';
import { PlaybackService } from './playback.service';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const DURATION_SEC = 1000;

function buildCommand(overrides: Record<string, number> = {}) {
  return {
    userId: USER_ID,
    contentId: CONTENT_ID,
    positionSec: 500,
    maxReachedSec: 500,
    listenedSecDelta: 5,
    contentVersion: 1,
    now: NOW,
    ...overrides,
  };
}

function buildItem(status = LibraryItemStatus.IN_PROGRESS): LibraryItem {
  return {
    id: 'item-1',
    status,
    completedAt: null,
    content: { durationSec: DURATION_SEC },
  } as LibraryItem;
}

describe('PlaybackProgressService', () => {
  let service: PlaybackProgressService;
  let playbackService: jest.Mocked<PlaybackService>;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;

  beforeEach(() => {
    playbackService = {
      saveProgress: jest
        .fn()
        .mockImplementation(
          (
            _userId: string,
            contentId: string,
            positionSec: number,
            maxReachedSec: number,
          ) => ({ contentId, positionSec, maxReachedSec }),
        ),
      addListenedSec: jest.fn().mockResolvedValue(true),
      recordSignal: jest.fn(),
      findProgress: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PlaybackService>;

    contentService = {
      getById: jest
        .fn()
        .mockResolvedValue({ durationSec: DURATION_SEC, contentVersion: 1 }),
    } as unknown as jest.Mocked<ContentService>;

    libraryService = {
      findItemWithContentByContentId: jest.fn().mockResolvedValue(buildItem()),
      // 기본은 "상태가 그대로" — 기준 미달이라 전이가 일어나지 않은 경우다
      completeItem: jest.fn().mockResolvedValue(buildItem()),
    } as unknown as jest.Mocked<LibraryService>;

    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    service = new PlaybackProgressService(
      playbackService,
      contentService,
      libraryService,
      dataSource,
    );
  });

  describe('saveProgress', () => {
    it('길이를 넘겨 온 값은 거부하지 않고 길이로 맞춘다', async () => {
      // given — 경계·배속 타이밍 오차는 정상이다 (player-api.md 4.3 서버 처리 3)

      // when
      await service.saveProgress(
        buildCommand({ positionSec: 1010, maxReachedSec: 1010 }),
      );

      // then
      expect(playbackService.saveProgress).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        DURATION_SEC,
        DURATION_SEC,
        expect.anything(),
      );
    });

    it('버전이 다르면 저장하지 않고 서버가 보관 중인 값을 돌려준다', async () => {
      // given — 길이가 짧아진 재발행에서 낡은 도달값이 가짜 완청을 만드는 것을 막는다
      contentService.getById.mockResolvedValue({
        durationSec: DURATION_SEC,
        contentVersion: 2,
      } as never);
      playbackService.findProgress.mockResolvedValue({
        contentId: CONTENT_ID,
        positionSec: 10,
        maxReachedSec: 20,
      });

      // when
      const result = await service.saveProgress(buildCommand());

      // then
      expect(playbackService.saveProgress).not.toHaveBeenCalled();
      expect(playbackService.addListenedSec).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        positionSec: 10,
        maxReachedSec: 20,
        contentVersion: 2,
      });
    });

    it('청취 시간 증분에 상한을 걸어 적산한다', async () => {
      // given — 정산 원천이라 조작·버그로 부풀려지면 배분이 왜곡된다 (player-api.md 7장)

      // when
      await service.saveProgress(buildCommand({ listenedSecDelta: 999_999 }));

      // then
      expect(playbackService.addListenedSec).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        3600,
        expect.anything(),
      );
    });

    it('도달 위치가 90%에 이르면 완청으로 전이하고 신호를 남긴다', async () => {
      // given
      libraryService.completeItem.mockResolvedValue({
        id: 'item-1',
        status: LibraryItemStatus.COMPLETED,
        completedAt: NOW,
      } as LibraryItem);

      // when
      const result = await service.saveProgress(
        buildCommand({ maxReachedSec: 900 }),
      );

      // then
      expect(result.libraryItem).toEqual({
        id: 'item-1',
        status: LibraryItemStatus.COMPLETED,
        completedAt: NOW,
      });
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        UserSignalAction.COMPLETE,
        expect.anything(),
      );
    });

    it('기준에 못 미치면 상태를 바꾸지 않고 신호도 남기지 않는다', async () => {
      // given — 미달의 계약은 "조용히 무시"다 (common-error-handling.md 9장)
      libraryService.completeItem.mockRejectedValue(
        new BusinessConflictException({
          errorCode: ErrorCode.LIBRARY_COMPLETION_NOT_REACHED,
          message: '아직 완청 기준에 도달하지 않았어요',
          logLevel: 'info',
        }),
      );

      // when
      const result = await service.saveProgress(
        buildCommand({ maxReachedSec: 100 }),
      );

      // then
      expect(result.libraryItem?.status).toBe(LibraryItemStatus.IN_PROGRESS);
      expect(playbackService.recordSignal).not.toHaveBeenCalled();
    });

    it('완청 전이 중의 DB 실패는 삼키지 않고 그대로 던진다', async () => {
      // given — 삼키면 abort된 트랜잭션 위에서 COMMIT이 조용히 ROLLBACK으로 바뀌어
      //          클라이언트는 200을 받는데 위치·청취 시간이 전부 유실된다
      libraryService.completeItem.mockRejectedValue(
        new Error('deadlock detected'),
      );

      // when / then
      await expect(
        service.saveProgress(buildCommand({ maxReachedSec: 900 })),
      ).rejects.toThrow('deadlock detected');
    });

    it('이미 완료된 항목은 전이도 신호도 반복하지 않는다', async () => {
      // given — completed_at은 최초 값을 유지하고 되감아 들어도 내려가지 않는다
      libraryService.findItemWithContentByContentId.mockResolvedValue(
        buildItem(LibraryItemStatus.COMPLETED),
      );

      // when
      await service.saveProgress(buildCommand({ maxReachedSec: 950 }));

      // then
      expect(libraryService.completeItem).not.toHaveBeenCalled();
      expect(playbackService.recordSignal).not.toHaveBeenCalled();
    });

    it('길이를 모르는 콘텐츠는 완청으로 판정하지 않는다', async () => {
      // given — 폴백은 library-api.md 4.5다. 여기서 완료시키면 가짜 완청이 된다
      libraryService.findItemWithContentByContentId.mockResolvedValue({
        id: 'item-1',
        status: LibraryItemStatus.IN_PROGRESS,
        completedAt: null,
        content: { durationSec: 0 },
      } as LibraryItem);
      contentService.getById.mockResolvedValue({
        durationSec: 0,
        contentVersion: 1,
      } as never);

      // when
      await service.saveProgress(buildCommand({ maxReachedSec: 999_999 }));

      // then
      expect(libraryService.completeItem).not.toHaveBeenCalled();
    });

    it('라이브러리에 없는 콘텐츠는 진행만 저장한다', async () => {
      // given — 상태 전이·complete 신호는 라이브러리 행이 전제다
      libraryService.findItemWithContentByContentId.mockResolvedValue(null);

      // when
      const result = await service.saveProgress(
        buildCommand({ maxReachedSec: 950 }),
      );

      // then
      expect(result.libraryItem).toBeNull();
      expect(playbackService.saveProgress).toHaveBeenCalled();
      expect(playbackService.recordSignal).not.toHaveBeenCalled();
    });
  });
});
