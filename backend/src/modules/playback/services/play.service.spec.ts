import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemStatus } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { PlayEntryPoint, UserSignalAction } from '../playback.enum';
import { PlayService } from './play.service';
import { PlaybackService } from './playback.service';

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

describe('PlayService', () => {
  let service: PlayService;
  let playbackService: jest.Mocked<PlaybackService>;
  let contentService: jest.Mocked<ContentService>;
  let userService: jest.Mocked<UserService>;
  let planService: jest.Mocked<PlanService>;
  let libraryService: jest.Mocked<LibraryService>;
  let dripExclusionService: jest.Mocked<DripExclusionService>;

  beforeEach(() => {
    playbackService = {
      isCountedToday: jest.fn().mockResolvedValue(false),
      countPlays: jest.fn().mockResolvedValue(0),
      recordPlay: jest.fn().mockResolvedValue(true),
      recordSignal: jest.fn(),
      findProgress: jest.fn().mockResolvedValue(null),
      buildQuota: jest.fn().mockResolvedValue({
        dailyPlayLimit: FREE_LIMIT,
        dailyPlayCount: 1,
        serviceDate: '2026-08-05',
      }),
    } as unknown as jest.Mocked<PlaybackService>;

    contentService = {
      getPublishedById: jest.fn().mockResolvedValue({ id: CONTENT_ID }),
    } as unknown as jest.Mocked<ContentService>;

    userService = {
      getById: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, tier: UserTier.LIGHT }),
    } as unknown as jest.Mocked<UserService>;

    planService = {
      getPlayLimitPolicy: jest
        .fn()
        .mockResolvedValue({ dailyPlayLimit: FREE_LIMIT, isTopTier: false }),
    } as unknown as jest.Mocked<PlanService>;

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
      contentService,
      userService,
      planService,
      libraryService,
      dripExclusionService,
      dataSource,
    );
  });

  describe('startPlay', () => {
    it('무료 사용자가 한도를 남겨두었으면 재생되고 1회가 차감된다', async () => {
      // given
      playbackService.countPlays.mockResolvedValue(1);

      // when
      const result = await service.startPlay(buildCommand());

      // then
      expect(result.counted).toBe(true);
      expect(playbackService.recordPlay).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        NOW,
        expect.anything(),
      );
    });

    it('무료 한도를 모두 소진하면 페이월을 여는 코드로 막는다', async () => {
      // given
      playbackService.countPlays.mockResolvedValue(FREE_LIMIT);

      // when
      const error = await catchError(service.startPlay(buildCommand()));

      // then
      expect(error.errorCode).toBe(ErrorCode.PLAY_LIMIT_EXCEEDED);
      expect(playbackService.recordPlay).not.toHaveBeenCalled();
    });

    it('최상위 티어가 한도를 소진하면 페이월이 아니라 한도 안내로 막는다', async () => {
      // given — 더 올라갈 티어가 없어 팔 것이 없다 (paywall.md 4.1)
      planService.getPlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: 5,
        isTopTier: true,
      });
      playbackService.countPlays.mockResolvedValue(5);

      // when
      const error = await catchError(service.startPlay(buildCommand()));

      // then
      expect(error.errorCode).toBe(ErrorCode.PLAY_LIMIT_REACHED);
    });

    it('한도를 소진했어도 오늘 이미 재생한 콘텐츠는 이어들을 수 있다', async () => {
      // given — 차감이 없는 재생이라 한도와 무관하다 (paywall.md 7)
      playbackService.countPlays.mockResolvedValue(FREE_LIMIT);
      playbackService.isCountedToday.mockResolvedValue(true);
      playbackService.recordPlay.mockResolvedValue(false);

      // when
      const result = await service.startPlay(buildCommand());

      // then
      expect(result.counted).toBe(false);
    });

    it('무제한 티어는 카운트를 세지 않고 재생한다', async () => {
      // given
      planService.getPlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: true,
      });

      // when
      await service.startPlay(buildCommand());

      // then
      expect(playbackService.countPlays).not.toHaveBeenCalled();
    });

    it('재생한 콘텐츠는 드립 재적립에서 영구 제외된다', async () => {
      // given

      // when
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

    it('진입점이 달라도 판정 규칙은 바뀌지 않는다', async () => {
      // given — 판정에 쓰이면 진입점을 위조해 한도를 우회할 수 있다
      playbackService.countPlays.mockResolvedValue(FREE_LIMIT);

      // when
      const error = await catchError(
        service.startPlay({
          ...buildCommand(),
          entryPoint: PlayEntryPoint.PUSH,
        }),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.PLAY_LIMIT_EXCEEDED);
    });
  });
});
