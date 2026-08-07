import { PlaybackProgressRepository } from '../repositories/playback-progress.repository';
import { PlayRecordRepository } from '../repositories/play-record.repository';
import { UserSignalRepository } from '../repositories/user-signal.repository';
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
  let userSignalRepository: jest.Mocked<UserSignalRepository>;

  beforeEach(() => {
    progressRepository = {
      findByUserIdAndContentId: jest.fn().mockResolvedValue(null),
      findAllByUserIdAndContentIds: jest.fn().mockResolvedValue([]),
      findAllStartedContentIdsByUserId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PlaybackProgressRepository>;

    playRecordRepository = {
      countByUserIdAndPlayDate: jest.fn().mockResolvedValue(0),
      existsByUserIdAndContentIdAndPlayDate: jest.fn().mockResolvedValue(false),
      findAllCountedContentIds: jest.fn().mockResolvedValue([]),
      insertIgnoringConflicts: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<PlayRecordRepository>;

    userSignalRepository = {
      insert: jest.fn(),
    } as unknown as jest.Mocked<UserSignalRepository>;

    service = new PlaybackService(
      progressRepository,
      playRecordRepository,
      userSignalRepository,
    );
  });

  describe('recordPlay', () => {
    it('03시 59분에 재생하면 전날의 서비스 날짜로 적재한다', async () => {
      // given — 하루의 경계는 자정이 아니라 04:00 KST다 (domain.md 1.2)

      // when
      await service.recordPlay(USER_ID, CONTENT_ID, BEFORE_BOUNDARY);

      // then
      expect(playRecordRepository.insertIgnoringConflicts).toHaveBeenCalledWith(
        expect.objectContaining({ playDate: '2026-08-04' }),
        undefined,
      );
    });

    it('04시 정각에 재생하면 당일의 서비스 날짜로 적재한다', async () => {
      // given

      // when
      await service.recordPlay(USER_ID, CONTENT_ID, AFTER_BOUNDARY);

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
        AFTER_BOUNDARY,
      );

      // then
      expect(counted).toBe(false);
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

  describe('isCountedToday', () => {
    it('03시 59분의 판정은 전날의 서비스 날짜를 본다', async () => {
      // given

      // when
      await service.isCountedToday(USER_ID, CONTENT_ID, BEFORE_BOUNDARY);

      // then
      expect(
        playRecordRepository.existsByUserIdAndContentIdAndPlayDate,
      ).toHaveBeenCalledWith(USER_ID, CONTENT_ID, '2026-08-04', undefined);
    });
  });
});
