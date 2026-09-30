import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';

import { DripFeedbackService } from './drip-feedback.service';

// 2026-09-30(수) 12:00 KST — 어제 = 09-29, 이번 주 월요일 = 09-28
const NOW = new Date('2026-09-30T03:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const C1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const C2 = 'bbbbbbbb-1111-4111-8111-111111111111';
const C3 = 'cccccccc-1111-4111-8111-111111111111';

function item(
  contentId: string,
  overrides: Partial<LibraryItem> = {},
): LibraryItem {
  return {
    id: `item-${contentId.slice(0, 8)}`,
    userId: USER_ID,
    contentId,
    source: LibraryItemSource.DRIP,
    status: LibraryItemStatus.UNPLAYED,
    // 어제 04:05 KST 편성
    addedAt: new Date('2026-09-28T19:05:00.000Z'),
    algorithmVersion: '2026-09-30.1',
    content: {
      id: contentId,
      title: `제목 ${contentId.slice(0, 2)}`,
      thumbnailUrl: 'https://t/x.jpg',
    },
    ...overrides,
  } as unknown as LibraryItem;
}

describe('DripFeedbackService', () => {
  let service: DripFeedbackService;
  let repository: {
    findAllByUserIdAndContentIds: jest.Mock;
    upsert: jest.Mock;
    summarizeByVersion: jest.Mock;
  };
  let libraryService: {
    findPlacedBetween: jest.Mock;
    findPlacedItems: jest.Mock;
  };
  let userSettingService: { getSettings: jest.Mock; updateSettings: jest.Mock };

  beforeEach(() => {
    repository = {
      findAllByUserIdAndContentIds: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
      summarizeByVersion: jest.fn().mockResolvedValue([]),
    };
    libraryService = {
      findPlacedBetween: jest.fn().mockResolvedValue([item(C1), item(C2)]),
      findPlacedItems: jest.fn().mockResolvedValue([item(C1), item(C2)]),
    };
    userSettingService = {
      getSettings: jest
        .fn()
        .mockResolvedValue({ dripFeedbackMutedUntil: null }),
      updateSettings: jest.fn().mockResolvedValue({}),
    };
    service = new DripFeedbackService(
      repository as never,
      libraryService as never,
      userSettingService as never,
    );
  });

  describe('getPrompt', () => {
    it('어제 서비스 날짜의 정규 편성분 중 미평가분을 최대 2편 돌려주고 show=true', async () => {
      const view = await service.getPrompt(USER_ID, NOW);

      expect(view.show).toBe(true);
      expect(view.placedDate).toBe('2026-09-29');
      expect(view.items.map((i) => i.contentId)).toEqual([C1, C2]);
      // 어제 04:00 ~ 오늘 04:00 KST 구간으로 조회한다
      const [, start, end] = libraryService.findPlacedBetween.mock.calls[0] as [
        string,
        Date,
        Date,
      ];
      expect(start.toISOString()).toBe('2026-09-28T19:00:00.000Z');
      expect(end.toISOString()).toBe('2026-09-29T19:00:00.000Z');
    });

    it('이미 평가한 편은 빼고, 전부 평가했으면 show=false', async () => {
      repository.findAllByUserIdAndContentIds.mockResolvedValue([
        { contentId: C1 },
        { contentId: C2 },
      ]);

      const view = await service.getPrompt(USER_ID, NOW);

      expect(view.show).toBe(false);
      expect(view.items).toEqual([]);
    });

    it('탐험 편은 묻지 않는다 — 정규 드립만', async () => {
      libraryService.findPlacedBetween.mockResolvedValue([
        item(C1, { source: LibraryItemSource.DISCOVERY }),
        item(C2),
      ]);

      const view = await service.getPrompt(USER_ID, NOW);

      expect(view.items.map((i) => i.contentId)).toEqual([C2]);
    });

    it('이번 주 그만 보기 중이면 편성분이 있어도 show=false 이고 조회하지 않는다', async () => {
      userSettingService.getSettings.mockResolvedValue({
        dripFeedbackMutedUntil: '2026-10-05',
      });

      const view = await service.getPrompt(USER_ID, NOW);

      expect(view).toEqual({
        show: false,
        items: [],
        placedDate: '2026-09-29',
        mutedUntil: '2026-10-05',
      });
      expect(libraryService.findPlacedBetween).not.toHaveBeenCalled();
    });

    it('그만 보기 기한이 지났으면 다시 묻는다', async () => {
      userSettingService.getSettings.mockResolvedValue({
        dripFeedbackMutedUntil: '2026-09-28',
      });

      const view = await service.getPrompt(USER_ID, NOW);

      expect(view.show).toBe(true);
      expect(view.mutedUntil).toBeNull();
    });
  });

  describe('rate', () => {
    it('내 편성분이면 편성 시점의 알고리즘 버전·서비스 날짜와 함께 upsert 한다', async () => {
      await service.rate({
        userId: USER_ID,
        ratings: [
          { contentId: C1, stars: 5 },
          { contentId: C2, stars: 2 },
        ],
        now: NOW,
      });

      expect(repository.upsert).toHaveBeenCalledWith([
        {
          userId: USER_ID,
          contentId: C1,
          source: LibraryItemSource.DRIP,
          algorithmVersion: '2026-09-30.1',
          placedDate: '2026-09-29',
          stars: 5,
        },
        expect.objectContaining({ contentId: C2, stars: 2 }),
      ]);
    });

    it('편성분이 아닌 콘텐츠가 하나라도 섞이면 전부 거부한다 — 부분 저장 없음', async () => {
      libraryService.findPlacedItems.mockResolvedValue([item(C1)]);

      await expect(
        service.rate({
          userId: USER_ID,
          ratings: [
            { contentId: C1, stars: 4 },
            { contentId: C3, stars: 4 },
          ],
          now: NOW,
        }),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.DRIP_FEEDBACK_NOT_RATEABLE,
      });
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('접수 기간(7일)이 지난 편성분은 거부한다', async () => {
      libraryService.findPlacedItems.mockResolvedValue([
        item(C1, { addedAt: new Date('2026-09-20T19:05:00.000Z') }),
      ]);

      await expect(
        service.rate({
          userId: USER_ID,
          ratings: [{ contentId: C1, stars: 3 }],
          now: NOW,
        }),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.DRIP_FEEDBACK_NOT_RATEABLE,
      });
    });
  });

  describe('mute', () => {
    it('다음 서비스 주 월요일 라벨까지 억제한다 — 수요일에 누르면 다음 주 월요일', async () => {
      const result = await service.mute(USER_ID, NOW);

      expect(result).toEqual({ mutedUntil: '2026-10-05' });
      expect(userSettingService.updateSettings).toHaveBeenCalledWith(USER_ID, {
        dripFeedbackMutedUntil: '2026-10-05',
      });
    });

    it('월요일 03시(아직 지난주)에 누르면 이번 주 월요일이 기한이다 — 주 경계도 04시', async () => {
      // 2026-09-28(월) 03:00 KST = 09-27 18:00Z → 서비스 주는 09-21 시작
      const result = await service.mute(
        USER_ID,
        new Date('2026-09-27T18:00:00.000Z'),
      );

      expect(result.mutedUntil).toBe('2026-09-28');
    });
  });
});
