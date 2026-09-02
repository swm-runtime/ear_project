import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { PlaybackService } from './playback.service';
import { PlayPolicyService } from './play-policy.service';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const FREE_LIMIT = 2;

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

/**
 * `paywall.md` 4.1 판정 — PRD 9.1이 단위 테스트를 요구하는 정책 로직이다
 * (무료 하루 2편 카운트·페이월 트리거·재청취 창 15일).
 */
describe('PlayPolicyService', () => {
  let service: PlayPolicyService;
  let playbackService: jest.Mocked<PlaybackService>;
  let userService: jest.Mocked<UserService>;
  let planService: jest.Mocked<PlanService>;

  beforeEach(() => {
    playbackService = {
      isWithinReplayWindow: jest.fn().mockResolvedValue(false),
      countPlays: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PlaybackService>;

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

    service = new PlayPolicyService(playbackService, userService, planService);
  });

  describe('assertPlayable', () => {
    it('무료 사용자가 한도를 남겨두었으면 차감되는 재생으로 허용한다', async () => {
      // given
      playbackService.countPlays.mockResolvedValue(1);

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT_ID, NOW);

      // then
      expect(permission).toEqual({
        deductsQuota: true,
        opensReplayWindow: true,
        dailyPlayLimit: FREE_LIMIT,
      });
    });

    it('무료 한도를 모두 소진하면 페이월을 여는 코드로 막는다', async () => {
      // given
      playbackService.countPlays.mockResolvedValue(FREE_LIMIT);

      // when
      const error = await catchError(
        service.assertPlayable(USER_ID, CONTENT_ID, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.PLAY_LIMIT_EXCEEDED);
    });

    it('최상위 티어가 한도를 소진하면 페이월이 아니라 한도 안내로 막는다', async () => {
      // given — 더 올라갈 티어가 없어 팔 것이 없다 (paywall.md 4.1)
      planService.getPlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: 5,
        isTopTier: true,
      });
      playbackService.countPlays.mockResolvedValue(5);

      // when
      const error = await catchError(
        service.assertPlayable(USER_ID, CONTENT_ID, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.PLAY_LIMIT_REACHED);
    });

    it('재청취 창 안이면 한도를 소진했어도 차감 없이 허용한다', async () => {
      // given — 창 검사가 한도 검사보다 먼저다 (paywall.md 4.3-1)
      playbackService.isWithinReplayWindow.mockResolvedValue(true);
      playbackService.countPlays.mockResolvedValue(FREE_LIMIT);

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT_ID, NOW);

      // then
      expect(permission.deductsQuota).toBe(false);
      expect(permission.opensReplayWindow).toBe(false);
      expect(playbackService.countPlays).not.toHaveBeenCalled();
    });

    it('무제한 티어는 카운트를 세지 않고 허용한다', async () => {
      // given
      planService.getPlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: true,
      });

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT_ID, NOW);

      // then
      expect(permission).toEqual({
        deductsQuota: false,
        opensReplayWindow: true,
        dailyPlayLimit: null,
      });
      expect(playbackService.countPlays).not.toHaveBeenCalled();
      expect(playbackService.isWithinReplayWindow).not.toHaveBeenCalled();
    });

    it('무제한 티어의 재생도 재청취 창의 기산점이 된다', async () => {
      // given — 유료 티어도 15일 재청취 권리를 똑같이 지급한다(결정 2026-08-11).
      //          강등 후에도 최근 들은 콘텐츠를 차감 없이 이어 들을 수 있다
      planService.getPlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: true,
      });

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT_ID, NOW);

      // then — 차감(counted 응답)과 기산점(is_counted 행)이 갈라지는 지점이다
      expect(permission.deductsQuota).toBe(false);
      expect(permission.opensReplayWindow).toBe(true);
    });
  });
});
