import { DataSource } from 'typeorm';

import { ContentService } from '@/modules/content/services/content.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';

import { PlayEntryPoint, UserSignalAction } from '../playback.enum';
import { PlayService } from './play.service';
import { PlaybackService } from './playback.service';
import { PlayPolicyService } from './play-policy.service';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const FREE_LIMIT = 2;

function buildCommand() {
  return {
    userId: USER_ID,
    contentId: CONTENT_ID,
    entryPoint: PlayEntryPoint.LIBRARY,
    now: NOW,
  };
}

/**
 * **판정 자체는 여기서 테스트하지 않는다** — `PlayPolicyService`가 소유하며 그쪽 spec이
 * 검증한다. 이 spec의 관심사는 판정 결과를 받아 **적재·전이·신호를 순서대로 수행하는가**다.
 */
describe('PlayService', () => {
  let service: PlayService;
  let playbackService: jest.Mocked<PlaybackService>;
  let playPolicyService: jest.Mocked<PlayPolicyService>;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
  let dripExclusionService: jest.Mocked<DripExclusionService>;

  beforeEach(() => {
    playbackService = {
      recordPlay: jest.fn().mockResolvedValue(true),
      recordSignal: jest.fn(),
      findProgress: jest.fn().mockResolvedValue(null),
      buildQuota: jest.fn().mockResolvedValue({
        dailyPlayLimit: FREE_LIMIT,
        dailyPlayCount: 1,
        serviceDate: '2026-08-05',
      }),
    } as unknown as jest.Mocked<PlaybackService>;

    playPolicyService = {
      assertPlayable: jest.fn().mockResolvedValue({
        deductsQuota: true,
        opensReplayWindow: true,
        dailyPlayLimit: FREE_LIMIT,
      }),
    } as unknown as jest.Mocked<PlayPolicyService>;

    contentService = {
      getPublishedById: jest.fn().mockResolvedValue({ id: CONTENT_ID }),
    } as unknown as jest.Mocked<ContentService>;

    libraryService = {
      markPlayStarted: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<LibraryService>;

    dripExclusionService = {
      exclude: jest.fn(),
    } as unknown as jest.Mocked<DripExclusionService>;

    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    service = new PlayService(
      playbackService,
      playPolicyService,
      contentService,
      libraryService,
      dripExclusionService,
      dataSource,
    );
  });

  describe('startPlay', () => {
    it('차감이 발생하는 재생이면 카운트 행을 차감 행으로 남긴다', async () => {
      // given / when
      const result = await service.startPlay(buildCommand());

      // then
      expect(result.counted).toBe(true);
      expect(playbackService.recordPlay).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        true,
        NOW,
        expect.anything(),
      );
    });

    it('재청취 창 안이면 행은 생겨도 차감으로 알리지 않는다', async () => {
      // given — 창 안의 재청취도 listened_sec 적산 대상이라 행 자체는 필요하지만,
      //          `counted`는 "행이 생겼는가"가 아니라 "차감이 발생했는가"다
      playPolicyService.assertPlayable.mockResolvedValue({
        deductsQuota: false,
        opensReplayWindow: false,
        dailyPlayLimit: FREE_LIMIT,
      });
      playbackService.recordPlay.mockResolvedValue(true);

      // when
      const result = await service.startPlay(buildCommand());

      // then
      expect(playbackService.recordPlay).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        false,
        NOW,
        expect.anything(),
      );
      expect(result.counted).toBe(false);
    });

    it('오늘 이미 재생한 콘텐츠는 행이 늘지 않아 차감도 아니다', async () => {
      // given — 유니크 제약이 하루 단위 중복을 막는다 (paywall.md 4.3)
      playbackService.recordPlay.mockResolvedValue(false);

      // when
      const result = await service.startPlay(buildCommand());

      // then
      expect(result.counted).toBe(false);
    });

    it('판정이 막으면 카운트를 적재하지 않는다', async () => {
      // given
      playPolicyService.assertPlayable.mockRejectedValue(new Error('blocked'));

      // when
      await expect(service.startPlay(buildCommand())).rejects.toThrow();

      // then
      expect(playbackService.recordPlay).not.toHaveBeenCalled();
    });

    it('재생한 콘텐츠는 드립 재적립에서 영구 제외된다', async () => {
      // given / when
      await service.startPlay(buildCommand());

      // then
      expect(dripExclusionService.exclude).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        DripExclusionReason.PLAYED,
        NOW,
        expect.anything(),
      );
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        UserSignalAction.PLAY,
        expect.anything(),
      );
    });

    it('라이브러리에 없는 콘텐츠를 재생하면 항목 없이 응답한다', async () => {
      // given — 재생이 담기를 유발하지 않는다 (library-api.md 4.4)

      // when
      const result = await service.startPlay(buildCommand());

      // then
      expect(result.libraryItem).toBeNull();
    });

    it('라이브러리에 있으면 재생 시작 상태와 시각을 함께 내려준다', async () => {
      // given
      libraryService.markPlayStarted.mockResolvedValue({
        id: 'item-1',
        status: LibraryItemStatus.IN_PROGRESS,
        lastPlayedAt: NOW,
      } as LibraryItem);

      // when
      const result = await service.startPlay(buildCommand());

      // then
      expect(result.libraryItem).toEqual({
        id: 'item-1',
        status: LibraryItemStatus.IN_PROGRESS,
        lastPlayedAt: NOW,
      });
    });

    it('진입점을 판정에 넘기지 않는다', async () => {
      // given — 판정에 쓰이면 진입점을 위조해 한도를 우회할 수 있다

      // when
      await service.startPlay({
        ...buildCommand(),
        entryPoint: PlayEntryPoint.PUSH,
      });

      // then
      expect(playPolicyService.assertPlayable).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        NOW,
        expect.anything(),
      );
    });
  });
});
