import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserTier } from '@/modules/user/user.enum';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';

import { PlaybackProgressRepository } from '../repositories/playback-progress.repository';
import { PlayDailyTotalRepository } from '../repositories/play-daily-total.repository';
import { PlayRecordRepository } from '../repositories/play-record.repository';
import { UserSignalRepository } from '../repositories/user-signal.repository';
import { UserSignalAction } from '../playback.enum';
import { PlaybackService } from './playback.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

/** 04:00 KST = 19:00 UTC 전날. 경계 앞뒤 1분을 고정값으로 둔다 (convention.md 7.3) */
const BEFORE_BOUNDARY = new Date('2026-08-04T18:59:00.000Z'); // KST 08-05 03:59
const AFTER_BOUNDARY = new Date('2026-08-04T19:00:00.000Z'); // KST 08-05 04:00

describe('PlaybackService', () => {
  let service: PlaybackService;
  let progressRepository: jest.Mocked<PlaybackProgressRepository>;
  let playRecordRepository: jest.Mocked<PlayRecordRepository>;
  let playDailyTotalRepository: jest.Mocked<PlayDailyTotalRepository>;
  let userSignalRepository: jest.Mocked<UserSignalRepository>;
  let userService: jest.Mocked<UserService>;
  let planService: jest.Mocked<PlanService>;

  beforeEach(() => {
    progressRepository = {
      findByUserIdAndContentId: jest.fn().mockResolvedValue(null),
      findAllByUserIdAndContentIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PlaybackProgressRepository>;

    playRecordRepository = {
      countByUserIdAndPlayDate: jest.fn().mockResolvedValue(0),
      findAllCountedContentIdsSince: jest.fn().mockResolvedValue([]),
      insertIgnoringConflicts: jest.fn().mockResolvedValue(true),
      existsCountedSince: jest.fn().mockResolvedValue(false),
      findLatestByUserIdAndContentId: jest.fn().mockResolvedValue(null),
      incrementListenedSec: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PlayRecordRepository>;

    playDailyTotalRepository = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PlayDailyTotalRepository>;

    userSignalRepository = {
      insert: jest.fn(),
      findAllRecentByUserId: jest.fn().mockResolvedValue([]),
      countByUserIdAndAction: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<UserSignalRepository>;

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
        .mockResolvedValue({ dailyPlayLimit: 2, isTopTier: false }),
    } as unknown as jest.Mocked<PlanService>;

    service = new PlaybackService(
      progressRepository,
      playRecordRepository,
      playDailyTotalRepository,
      userSignalRepository,
      userService,
      planService,
    );
  });

  describe('recordPlay', () => {
    it('03시 59분에 재생하면 전날의 서비스 날짜로 적재한다', async () => {
      // given — 하루의 경계는 자정이 아니라 04:00 KST다 (domain.md 1.2)

      // when
      await service.recordPlay(USER_ID, CONTENT_ID, true, BEFORE_BOUNDARY);

      // then
      expect(playRecordRepository.insertIgnoringConflicts).toHaveBeenCalledWith(
        expect.objectContaining({ playDate: '2026-08-04' }),
        undefined,
      );
    });

    it('04시 정각에 재생하면 당일의 서비스 날짜로 적재한다', async () => {
      // given

      // when
      await service.recordPlay(USER_ID, CONTENT_ID, true, AFTER_BOUNDARY);

      // then
      expect(playRecordRepository.insertIgnoringConflicts).toHaveBeenCalledWith(
        expect.objectContaining({ playDate: '2026-08-05' }),
        undefined,
      );
    });

    it('같은 날 같은 콘텐츠라 행이 생기지 않으면 차감되지 않았음을 알린다', async () => {
      // given
      playRecordRepository.insertIgnoringConflicts.mockResolvedValue(false);

      // when
      const counted = await service.recordPlay(
        USER_ID,
        CONTENT_ID,
        true,
        AFTER_BOUNDARY,
      );

      // then
      expect(counted).toBe(false);
      // 재생 행이 늘지 않았으니 누적 재생 수도 늘지 않는다
      expect(playDailyTotalRepository.add).not.toHaveBeenCalled();
    });

    it('행이 새로 생기면 그 서비스 날짜의 누적 재생 수에 1을 더한다 — 탈퇴로 줄지 않는 누적의 원천', async () => {
      const manager = {} as never;

      await service.recordPlay(
        USER_ID,
        CONTENT_ID,
        false,
        BEFORE_BOUNDARY,
        manager,
      );

      // 재청취 창 안(차감 없음)의 행도 재생 기록이라 센다 — `play_records` 행 수와 같은 정의
      expect(playDailyTotalRepository.add).toHaveBeenCalledWith(
        '2026-08-04',
        { playCount: 1, listenSec: 0 },
        manager,
      );
    });
  });

  describe('recordSignal', () => {
    it('완청 신호면 그 서비스 날짜의 누적 완청 수에 1을 더한다 — 신호가 지워져도 줄지 않는 누적', async () => {
      const manager = {} as never;

      await service.recordSignal(
        USER_ID,
        CONTENT_ID,
        UserSignalAction.COMPLETE,
        manager,
      );

      expect(userSignalRepository.insert).toHaveBeenCalled();
      expect(playDailyTotalRepository.add).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        { completeCount: 1 },
        manager,
      );
    });

    it('완청이 아닌 신호는 누적에 더하지 않는다', async () => {
      await service.recordSignal(USER_ID, CONTENT_ID, UserSignalAction.PLAY);

      expect(playDailyTotalRepository.add).not.toHaveBeenCalled();
    });
  });

  describe('addListenedSec', () => {
    it('재생 행에 더한 만큼 그 행의 날짜(재생 시작일)의 누적 청취 시간에도 더한다', async () => {
      const manager = {} as never;
      playRecordRepository.findLatestByUserIdAndContentId.mockResolvedValue({
        id: '7',
        playDate: '2026-08-03',
      } as never);

      const added = await service.addListenedSec(
        USER_ID,
        CONTENT_ID,
        30,
        manager,
      );

      expect(added).toBe(true);
      expect(playRecordRepository.incrementListenedSec).toHaveBeenCalledWith(
        '7',
        30,
        manager,
      );
      expect(playDailyTotalRepository.add).toHaveBeenCalledWith(
        '2026-08-03',
        { playCount: 0, listenSec: 30 },
        manager,
      );
    });

    it('재생 행이 없거나 더할 값이 0 이하면 누적에도 더하지 않는다', async () => {
      await service.addListenedSec(USER_ID, CONTENT_ID, 30);
      playRecordRepository.findLatestByUserIdAndContentId.mockResolvedValue({
        id: '7',
        playDate: '2026-08-03',
      } as never);
      await service.addListenedSec(USER_ID, CONTENT_ID, 0);

      expect(playDailyTotalRepository.add).not.toHaveBeenCalled();
    });
  });

  describe('buildQuota', () => {
    it('한도가 있으면 오늘의 서비스 날짜로 카운트를 집계한다', async () => {
      // given
      playRecordRepository.countByUserIdAndPlayDate.mockResolvedValue(1);

      // when
      const quota = await service.buildQuota(USER_ID, 2, BEFORE_BOUNDARY);

      // then
      expect(quota).toEqual({
        dailyPlayLimit: 2,
        dailyPlayCount: 1,
        serviceDate: '2026-08-04',
      });
    });

    it('무제한 티어면 카운트를 조회하지 않고 null로 내린다', async () => {
      // given — 무제한에 0을 내려주면 화면이 카운터를 그릴 근거가 생긴다

      // when
      const quota = await service.buildQuota(USER_ID, null, AFTER_BOUNDARY);

      // then
      expect(quota).toEqual({
        dailyPlayLimit: null,
        dailyPlayCount: null,
        serviceDate: '2026-08-05',
      });
      expect(
        playRecordRepository.countByUserIdAndPlayDate,
      ).not.toHaveBeenCalled();
    });
  });

  describe('buildQuotaForUser', () => {
    it('사용자 티어의 요금제 한도로 잔여 표시값을 조립한다', async () => {
      // given — 화면마다 다시 조립하면 같은 사용자에게 다른 숫자가 표시된다
      playRecordRepository.countByUserIdAndPlayDate.mockResolvedValue(1);

      // when
      const quota = await service.buildQuotaForUser(USER_ID, AFTER_BOUNDARY);

      // then
      expect(planService.getEffectivePlayLimitPolicy).toHaveBeenCalledWith(
        UserTier.LIGHT,
        false,
        undefined,
      );
      expect(quota).toEqual({
        dailyPlayLimit: 2,
        dailyPlayCount: 1,
        serviceDate: '2026-08-05',
      });
    });

    it('무제한 티어면 카운트도 null로 내린다', async () => {
      // given
      planService.getEffectivePlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: true,
      });

      // when
      const quota = await service.buildQuotaForUser(USER_ID, AFTER_BOUNDARY);

      // then
      expect(quota.dailyPlayLimit).toBeNull();
      expect(quota.dailyPlayCount).toBeNull();
    });

    it('가입 체험 중이면 체험 여부를 실어 묻는다 — 재생 판정과 같은 조립이다', async () => {
      // given — 잔여 표시와 재생 판정이 다른 한도를 보면 "남았다는데 막힌다"가 된다(subscription.md 4.8)
      userService.getById.mockResolvedValue({
        id: USER_ID,
        tier: UserTier.LIGHT,
        trialEndsAt: new Date(AFTER_BOUNDARY.getTime() + 60 * 60 * 1000),
      } as User);
      planService.getEffectivePlayLimitPolicy.mockResolvedValue({
        dailyPlayLimit: null,
        isTopTier: false,
      });

      // when
      const quota = await service.buildQuotaForUser(USER_ID, AFTER_BOUNDARY);

      // then — 무제한이라 화면이 잔여 표시를 그리지 않는다
      expect(planService.getEffectivePlayLimitPolicy).toHaveBeenCalledWith(
        UserTier.LIGHT,
        true,
        undefined,
      );
      expect(quota.dailyPlayLimit).toBeNull();
      expect(quota.dailyPlayCount).toBeNull();
    });
  });

  describe('findCountedContentIds', () => {
    it('목록 힌트도 단건 판정과 같은 창 시작일을 쓴다', async () => {
      // given — 힌트와 판정이 다르면 팝업 없이 차감되거나 거짓 차감 고지가 나간다
      playRecordRepository.findAllCountedContentIdsSince.mockResolvedValue([
        CONTENT_ID,
      ]);

      // when
      const counted = await service.findCountedContentIds(
        USER_ID,
        AFTER_BOUNDARY,
      );

      // then
      expect(
        playRecordRepository.findAllCountedContentIdsSince,
      ).toHaveBeenCalledWith(USER_ID, '2026-07-22', undefined);
      expect(counted.has(CONTENT_ID)).toBe(true);
    });
  });

  describe('isWithinReplayWindow', () => {
    it('15일 창의 시작일을 서비스 날짜 라벨 위에서 계산한다', async () => {
      // given — 당일을 포함해 15일이므로 14일을 거슬러 올라간다 (paywall.md 4.3-1)
      playRecordRepository.existsCountedSince.mockResolvedValue(true);

      // when
      const within = await service.isWithinReplayWindow(
        USER_ID,
        CONTENT_ID,
        AFTER_BOUNDARY,
      );

      // then
      expect(playRecordRepository.existsCountedSince).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        '2026-07-22',
        undefined,
      );
      expect(within).toBe(true);
    });

    it('03시 59분의 창도 전날의 서비스 날짜를 기준으로 잡는다', async () => {
      // given — 시각에서 빼고 다시 환산하면 04시 경계가 두 번 적용돼 하루가 밀린다

      // when
      await service.isWithinReplayWindow(USER_ID, CONTENT_ID, BEFORE_BOUNDARY);

      // then
      expect(playRecordRepository.existsCountedSince).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        '2026-07-21',
        undefined,
      );
    });
  });
});
