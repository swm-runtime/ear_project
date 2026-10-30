import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { SeriesPaywallService } from '@/modules/subscription/services/series-paywall.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { PlaybackService } from './playback.service';
import {
  PLAY_LIMIT_MESSAGE,
  PlayPolicyService,
  SERIES_EPISODE_LOCKED_MESSAGE,
} from './play-policy.service';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const SERIES_ID = 'bbbbbbbb-1111-4111-8111-111111111111';
/** 시리즈가 아닌 콘텐츠 — 종전 판정 테스트는 이 콘텐츠로 본다 */
const CONTENT = { id: CONTENT_ID, seriesId: null, episodeNo: null };
/** 시리즈 편 — 무료 편수(3) 안 / 밖 */
const EPISODE_3 = { id: CONTENT_ID, seriesId: SERIES_ID, episodeNo: 3 };
const EPISODE_4 = { id: CONTENT_ID, seriesId: SERIES_ID, episodeNo: 4 };

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
  /** 시리즈 유료화 스위치(KAN-290) — 기본은 꺼짐(종전과 같다) */
  let env: Record<string, string>;

  beforeEach(() => {
    env = {};
    playbackService = {
      isWithinReplayWindow: jest.fn().mockResolvedValue(false),
      countPlays: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PlaybackService>;

    userService = {
      getById: jest.fn().mockResolvedValue({
        id: USER_ID,
        tier: UserTier.LIGHT,
        trialEndsAt: null,
      }),
    } as unknown as jest.Mocked<UserService>;

    planService = {
      getEffectivePlayLimitPolicy: jest
        .fn()
        .mockResolvedValue({ dailyPlayLimit: FREE_LIMIT, isTopTier: false }),
      // 저장 티어가 유료 요금제인가 — 시리즈 유료화의 "열리는 사람" 판정 입력(데일리·프로)
      isPaidTier: jest.fn((tier: UserTier) =>
        Promise.resolve(tier === UserTier.PRO || tier === UserTier.DAILY),
      ),
    } as unknown as jest.Mocked<PlanService>;

    service = new PlayPolicyService(
      playbackService,
      userService,
      planService,
      new SeriesPaywallService(
        { get: (key: string) => env[key] } as never,
        planService,
      ),
    );
  });

  describe('assertPlayable', () => {
    it('무료 사용자가 한도를 남겨두었으면 차감되는 재생으로 허용한다', async () => {
      // given
      playbackService.countPlays.mockResolvedValue(1);

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT, NOW);

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
        service.assertPlayable(USER_ID, CONTENT, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.PLAY_LIMIT_EXCEEDED);
      expect(error.message).toBe(PLAY_LIMIT_MESSAGE);
    });

    it('최상위 티어가 한도를 소진하면 페이월이 아니라 한도 안내로 막는다', async () => {
      // given — 더 올라갈 티어가 없어 팔 것이 없다 (paywall.md 4.1)
      planService.getEffectivePlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: 5,
        isTopTier: true,
      });
      playbackService.countPlays.mockResolvedValue(5);

      // when
      const error = await catchError(
        service.assertPlayable(USER_ID, CONTENT, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.PLAY_LIMIT_REACHED);
      expect(error.message).toBe(PLAY_LIMIT_MESSAGE);
    });

    it('재청취 창 안이면 한도를 소진했어도 차감 없이 허용한다', async () => {
      // given — 창 검사가 한도 검사보다 먼저다 (paywall.md 4.3-1)
      playbackService.isWithinReplayWindow.mockResolvedValue(true);
      playbackService.countPlays.mockResolvedValue(FREE_LIMIT);

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT, NOW);

      // then
      expect(permission.deductsQuota).toBe(false);
      expect(permission.opensReplayWindow).toBe(false);
      expect(playbackService.countPlays).not.toHaveBeenCalled();
    });

    it('무제한 티어는 카운트를 세지 않고 허용한다', async () => {
      // given
      planService.getEffectivePlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: true,
      });

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT, NOW);

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
      planService.getEffectivePlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: true,
      });

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT, NOW);

      // then — 차감(counted 응답)과 기산점(is_counted 행)이 갈라지는 지점이다
      expect(permission.deductsQuota).toBe(false);
      expect(permission.opensReplayWindow).toBe(true);
    });
  });

  describe('assertPlayable — 가입 체험(subscription.md 4.8)', () => {
    // NOW 기준으로 아직 끝나지 않은 체험 / 이미 끝난 체험
    const activeTrial = new Date(NOW.getTime() + 60 * 60 * 1000);
    const expiredTrial = new Date(NOW.getTime() - 1);

    it('체험 중인 사용자는 체험 여부를 실어 한도 정책을 묻는다', async () => {
      // given
      userService.getById.mockResolvedValue({
        id: USER_ID,
        tier: UserTier.LIGHT,
        trialEndsAt: activeTrial,
      } as User);
      planService.getEffectivePlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: false,
      });

      // when
      const permission = await service.assertPlayable(USER_ID, CONTENT, NOW);

      // then — 무제한이라 카운트를 세지 않고, 재생은 재청취 창의 기산점이 된다
      expect(planService.getEffectivePlayLimitPolicy).toHaveBeenCalledWith(
        UserTier.LIGHT,
        true,
        undefined,
      );
      expect(permission).toEqual({
        deductsQuota: false,
        opensReplayWindow: true,
        dailyPlayLimit: null,
      });
      expect(playbackService.countPlays).not.toHaveBeenCalled();
    });

    it('체험이 끝났으면 체험 없이 판정한다', async () => {
      // given
      userService.getById.mockResolvedValue({
        id: USER_ID,
        tier: UserTier.LIGHT,
        trialEndsAt: expiredTrial,
      } as User);

      // when
      await service.assertPlayable(USER_ID, CONTENT, NOW);

      // then
      expect(planService.getEffectivePlayLimitPolicy).toHaveBeenCalledWith(
        UserTier.LIGHT,
        false,
        undefined,
      );
    });

    it('체험을 받지 않은 사용자는 종전과 같다', async () => {
      await service.assertPlayable(USER_ID, CONTENT, NOW);

      expect(planService.getEffectivePlayLimitPolicy).toHaveBeenCalledWith(
        UserTier.LIGHT,
        false,
        undefined,
      );
    });
  });

  describe('시리즈 유료화(KAN-290 — experiments-api.md 4.2)', () => {
    const activeTrial = new Date(NOW.getTime() + 60 * 60 * 1000);

    function givenUser(tier: UserTier, trialEndsAt: Date | null = null) {
      userService.getById.mockResolvedValue({
        id: USER_ID,
        tier,
        trialEndsAt,
      } as User);
    }

    beforeEach(() => {
      env.SERIES_PAYWALL_ENABLED = 'true';
    });

    it('무료 사용자의 4편은 SERIES_EPISODE_LOCKED로 막고 한도 판정까지 가지 않는다(차감 없음)', async () => {
      // given
      givenUser(UserTier.LIGHT);

      // when
      const error = await catchError(
        service.assertPlayable(USER_ID, EPISODE_4, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.SERIES_EPISODE_LOCKED);
      expect(error.message).toBe(SERIES_EPISODE_LOCKED_MESSAGE);
      expect(error.retryable).toBe(false);
      expect(error.getStatus()).toBe(403);
      expect(planService.getEffectivePlayLimitPolicy).not.toHaveBeenCalled();
      expect(playbackService.countPlays).not.toHaveBeenCalled();
    });

    it('한도를 소진했고 잠긴 편이면 잠금이 이긴다', async () => {
      // given
      givenUser(UserTier.LIGHT);
      playbackService.countPlays.mockResolvedValue(FREE_LIMIT);

      // when
      const error = await catchError(
        service.assertPlayable(USER_ID, EPISODE_4, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.SERIES_EPISODE_LOCKED);
    });

    it('데일리 구독자도 4편 이후를 듣는다 — 유료 요금제면 열린다(2026-10-30 팀 결정)', async () => {
      givenUser(UserTier.DAILY);

      await expect(
        service.assertPlayable(USER_ID, EPISODE_4, NOW),
      ).resolves.toBeDefined();
    });

    it('1~3편은 무료 사용자도 종전 판정 그대로 듣는다', async () => {
      givenUser(UserTier.LIGHT);

      const permission = await service.assertPlayable(USER_ID, EPISODE_3, NOW);

      expect(permission.deductsQuota).toBe(true);
    });

    it('프로(초대 코드 Pro 포함 — users.tier 가 pro)는 4편 이후도 듣는다', async () => {
      givenUser(UserTier.PRO);

      await expect(
        service.assertPlayable(USER_ID, EPISODE_4, NOW),
      ).resolves.toBeDefined();
    });

    it('가입 체험 중이면 4편 이후도 듣는다', async () => {
      givenUser(UserTier.LIGHT, activeTrial);

      await expect(
        service.assertPlayable(USER_ID, EPISODE_4, NOW),
      ).resolves.toBeDefined();
    });

    it('스위치가 꺼져 있으면 잠그지 않는다 — true 명시만 켠다', async () => {
      givenUser(UserTier.LIGHT);

      for (const value of ['', 'false', 'TRUE', 'yes']) {
        env.SERIES_PAYWALL_ENABLED = value;
        await expect(
          service.assertPlayable(USER_ID, EPISODE_4, NOW),
        ).resolves.toBeDefined();
      }
    });

    it('무료 편수 설정을 따른다 — SERIES_FREE_EPISODES=4 면 4편은 열리고 5편이 잠긴다', async () => {
      givenUser(UserTier.LIGHT);
      env.SERIES_FREE_EPISODES = '4';

      await expect(
        service.assertPlayable(USER_ID, EPISODE_4, NOW),
      ).resolves.toBeDefined();
      const error = await catchError(
        service.assertPlayable(USER_ID, { ...EPISODE_4, episodeNo: 5 }, NOW),
      );
      expect(error.errorCode).toBe(ErrorCode.SERIES_EPISODE_LOCKED);
    });

    it('목록 표시용 접근(resolveSeriesAccess)은 재생 게이트와 같은 판정이다', async () => {
      givenUser(UserTier.LIGHT);
      await expect(service.resolveSeriesAccess(USER_ID, NOW)).resolves.toEqual({
        lockedAfterEpisodeNo: 3,
      });

      givenUser(UserTier.PRO);
      await expect(service.resolveSeriesAccess(USER_ID, NOW)).resolves.toEqual({
        lockedAfterEpisodeNo: null,
      });

      env.SERIES_PAYWALL_ENABLED = '';
      userService.getById.mockClear();
      await expect(service.resolveSeriesAccess(USER_ID, NOW)).resolves.toEqual({
        lockedAfterEpisodeNo: null,
      });
      // 꺼져 있으면 사용자를 읽지 않는다
      expect(userService.getById).not.toHaveBeenCalled();
    });
  });
});
