import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentStatus } from '@/modules/content/content.enum';
import { UserMarket } from '@/modules/user/user.enum';

import { ContentReviewUnreviewableReason } from './content-review.enum';
import { ContentReviewService } from './content-review.service';

// 2026-10-29(목) 12:00 KST
const NOW = new Date('2026-10-29T03:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

function content(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTENT_ID,
    market: UserMarket.KR,
    status: ContentStatus.PUBLISHED,
    licenseExpiresAt: null,
    contentVersion: 3,
    ...overrides,
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    contentId: CONTENT_ID,
    stars: 4,
    text: '비유가 쉬워요',
    isCompleted: true,
    contentVersion: 3,
    market: UserMarket.KR,
    createdAt: new Date('2026-10-28T14:00:00.000Z'),
    updatedAt: new Date('2026-10-28T15:00:00.000Z'),
    ...overrides,
  };
}

async function capture(promise: Promise<unknown>): Promise<BusinessException> {
  try {
    await promise;
  } catch (error) {
    return error as BusinessException;
  }
  throw new Error('예외가 나지 않았다');
}

describe('ContentReviewService', () => {
  let service: ContentReviewService;
  let enabledValue: string | undefined;
  let repository: {
    findByUserIdAndContentId: jest.Mock;
    upsert: jest.Mock;
    findPromptCandidate: jest.Mock;
    summarizeByContent: jest.Mock;
    findAdminPage: jest.Mock;
  };
  let contentService: { getById: jest.Mock; getPublishedById: jest.Mock };
  let libraryService: { findCompletedContentIds: jest.Mock };
  let playbackService: { hasStartedPlaying: jest.Mock };
  let userService: { getByIdForUpdate: jest.Mock };
  let userSettingService: { getSettings: jest.Mock; updateSettings: jest.Mock };

  beforeEach(() => {
    enabledValue = 'true';
    repository = {
      findByUserIdAndContentId: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockImplementation((draft: Record<string, unknown>) =>
          Promise.resolve(reviewRow(draft)),
        ),
      findPromptCandidate: jest.fn().mockResolvedValue(null),
      summarizeByContent: jest.fn().mockResolvedValue([]),
      findAdminPage: jest.fn(),
    };
    contentService = {
      getById: jest.fn().mockResolvedValue(content()),
      getPublishedById: jest.fn().mockResolvedValue(content()),
    };
    libraryService = {
      findCompletedContentIds: jest
        .fn()
        .mockResolvedValue(new Set([CONTENT_ID])),
    };
    playbackService = {
      hasStartedPlaying: jest.fn().mockResolvedValue(true),
    };
    userService = { getByIdForUpdate: jest.fn().mockResolvedValue({}) };
    userSettingService = {
      getSettings: jest.fn().mockResolvedValue({
        contentReviewLastPromptedDate: null,
        contentReviewMutedUntil: null,
      }),
      updateSettings: jest.fn().mockResolvedValue({}),
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'CONTENT_REVIEW_ENABLED' ? enabledValue : undefined,
      ),
    };
    const dataSource = {
      transaction: jest.fn((work: (manager: unknown) => Promise<unknown>) =>
        work({}),
      ),
    };
    service = new ContentReviewService(
      repository as never,
      contentService as never,
      libraryService as never,
      playbackService as never,
      userService as never,
      userSettingService as never,
      configService as never,
      dataSource as never,
    );
  });

  describe('스위치', () => {
    it.each([
      ['true', true],
      [' true ', true],
      ['false', false],
      ['', false],
      [undefined, false],
      ['TRUE', false],
    ])('값 %j 이면 켜짐=%s — 정확히 true 일 때만 켜진다', (value, expected) => {
      enabledValue = value;
      expect(service.isEnabled()).toBe(expected);
    });
  });

  describe('getSheet (4.1)', () => {
    it('들어 본 편이면 저장할 수 있고 내 후기를 싣는다', async () => {
      repository.findByUserIdAndContentId.mockResolvedValue(reviewRow());

      const sheet = await service.getSheet(
        USER_ID,
        CONTENT_ID,
        UserMarket.KR,
        NOW,
      );

      expect(sheet).toMatchObject({
        enabled: true,
        reviewable: true,
        reason: null,
        review: { stars: 4, text: '비유가 쉬워요', isCompleted: true },
        rewardProgress: null,
      });
    });

    it('재생을 시작한 적 없으면 not_played', async () => {
      playbackService.hasStartedPlaying.mockResolvedValue(false);

      const sheet = await service.getSheet(
        USER_ID,
        CONTENT_ID,
        UserMarket.KR,
        NOW,
      );

      expect(sheet).toMatchObject({
        reviewable: false,
        reason: ContentReviewUnreviewableReason.NOT_PLAYED,
      });
    });

    it('회수된 편이면 withdrawn 이지만 이미 쓴 후기는 싣는다', async () => {
      contentService.getById.mockResolvedValue(
        content({ status: ContentStatus.WITHDRAWN }),
      );
      repository.findByUserIdAndContentId.mockResolvedValue(reviewRow());

      const sheet = await service.getSheet(
        USER_ID,
        CONTENT_ID,
        UserMarket.KR,
        NOW,
      );

      expect(sheet.reason).toBe(ContentReviewUnreviewableReason.WITHDRAWN);
      expect(sheet.review).not.toBeNull();
      // 앞 사유가 있으면 재생 여부를 묻지 않는다
      expect(playbackService.hasStartedPlaying).not.toHaveBeenCalled();
    });

    it('라이선스가 지난 편도 withdrawn 이다', async () => {
      contentService.getById.mockResolvedValue(
        content({ licenseExpiresAt: new Date('2026-10-01T00:00:00.000Z') }),
      );

      const sheet = await service.getSheet(
        USER_ID,
        CONTENT_ID,
        UserMarket.KR,
        NOW,
      );

      expect(sheet.reason).toBe(ContentReviewUnreviewableReason.WITHDRAWN);
    });

    it('스위치가 꺼져 있으면 enabled=false · disabled', async () => {
      enabledValue = 'false';

      const sheet = await service.getSheet(
        USER_ID,
        CONTENT_ID,
        UserMarket.KR,
        NOW,
      );

      expect(sheet).toMatchObject({
        enabled: false,
        reviewable: false,
        reason: ContentReviewUnreviewableReason.DISABLED,
        rewardProgress: null,
      });
    });

    it('다른 시장 편은 404 CONTENT_NOT_FOUND — 존재를 알리지 않는다', async () => {
      contentService.getById.mockResolvedValue(
        content({ market: UserMarket.GLOBAL }),
      );

      const error = await capture(
        service.getSheet(USER_ID, CONTENT_ID, UserMarket.KR, NOW),
      );

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(error.errorCode).toBe(ErrorCode.CONTENT_NOT_FOUND);
    });
  });

  describe('save (4.2)', () => {
    const command = (overrides: Record<string, unknown> = {}) => ({
      userId: USER_ID,
      contentId: CONTENT_ID,
      market: UserMarket.KR,
      stars: 5,
      text: '  출근길에 듣기 좋았어요  ',
      now: NOW,
      ...overrides,
    });

    it('앞뒤 공백을 뺀 글과 저장 시점의 완청 여부 · 편 버전 · 시장을 적는다', async () => {
      const result = await service.save(command());

      expect(userService.getByIdForUpdate).toHaveBeenCalledWith(
        USER_ID,
        expect.anything(),
      );
      expect(repository.upsert).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          contentId: CONTENT_ID,
          stars: 5,
          text: '출근길에 듣기 좋았어요',
          isCompleted: true,
          contentVersion: 3,
          market: UserMarket.KR,
        },
        expect.anything(),
      );
      expect(result.issuedPromotion).toBeNull();
      expect(result.review.text).toBe('출근길에 듣기 좋았어요');
    });

    it('끝까지 듣지 않았으면 is_completed=false 로 적는다', async () => {
      libraryService.findCompletedContentIds.mockResolvedValue(new Set());

      await service.save(command());

      expect(repository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ isCompleted: false }),
        expect.anything(),
      );
    });

    it('빈 글 · null 은 글 없음(null)으로 저장한다 — 있던 글을 지운다', async () => {
      await service.save(command({ text: '   ' }));
      await service.save(command({ text: null }));
      await service.save(command({ text: undefined }));

      const calls = repository.upsert.mock.calls as [{ text: unknown }][];
      expect(calls).toHaveLength(3);
      for (const [draft] of calls) {
        expect(draft.text).toBeNull();
      }
    });

    it('스위치가 꺼져 있으면 편을 보기 전에 409 CONTENT_REVIEW_DISABLED', async () => {
      enabledValue = '';

      const error = await capture(service.save(command()));

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.errorCode).toBe(ErrorCode.CONTENT_REVIEW_DISABLED);
      expect(contentService.getPublishedById).not.toHaveBeenCalled();
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('회수 · 만료 편은 노출 판정의 403 CONTENT_WITHDRAWN 을 그대로 낸다', async () => {
      contentService.getPublishedById.mockRejectedValue(
        new BusinessForbiddenException({
          errorCode: ErrorCode.CONTENT_WITHDRAWN,
          message: '제공이 종료된 콘텐츠예요',
        }),
      );

      const error = await capture(service.save(command()));

      expect(error.errorCode).toBe(ErrorCode.CONTENT_WITHDRAWN);
      expect(contentService.getPublishedById).toHaveBeenCalledWith(
        CONTENT_ID,
        undefined,
        NOW,
        UserMarket.KR,
      );
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('재생을 시작한 적 없는 편은 409 CONTENT_REVIEW_NOT_PLAYED', async () => {
      playbackService.hasStartedPlaying.mockResolvedValue(false);

      const error = await capture(service.save(command()));

      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.errorCode).toBe(ErrorCode.CONTENT_REVIEW_NOT_PLAYED);
      expect(repository.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getPrompt (4.3)', () => {
    it('스위치가 꺼져 있으면 enabled=false · show=false 이고 아무것도 조회하지 않는다', async () => {
      enabledValue = 'false';

      expect(await service.getPrompt(USER_ID, UserMarket.KR, NOW)).toEqual({
        enabled: false,
        show: false,
        item: null,
        rewardProgress: null,
        mutedUntil: null,
      });
      expect(repository.findPromptCandidate).not.toHaveBeenCalled();
    });

    it('후보 편이 있으면 묻는다 — 끝까지 들은 서비스 날짜를 싣는다', async () => {
      repository.findPromptCandidate.mockResolvedValue({
        contentId: CONTENT_ID,
        title: '관세',
        thumbnailUrl: 'https://t/x.jpg',
        language: 'ko',
        // 10-28 23:30 KST
        completedAt: new Date('2026-10-28T14:30:00.000Z'),
      });

      const prompt = await service.getPrompt(USER_ID, UserMarket.KR, NOW);

      expect(prompt).toMatchObject({
        enabled: true,
        show: true,
        item: { contentId: CONTENT_ID, completedDate: '2026-10-28' },
        mutedUntil: null,
      });
      expect(repository.findPromptCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, market: UserMarket.KR }),
      );
    });

    it('후보가 없으면 show=false', async () => {
      const prompt = await service.getPrompt(USER_ID, UserMarket.KR, NOW);

      expect(prompt).toMatchObject({ enabled: true, show: false, item: null });
    });

    it('마지막으로 물은 지 4일이면 후보를 찾지 않고 show=false', async () => {
      userSettingService.getSettings.mockResolvedValue({
        contentReviewLastPromptedDate: '2026-10-25',
        contentReviewMutedUntil: null,
      });

      const prompt = await service.getPrompt(USER_ID, UserMarket.KR, NOW);

      expect(prompt.show).toBe(false);
      expect(repository.findPromptCandidate).not.toHaveBeenCalled();
    });

    it('그만 보기 중이면 show=false 와 종료 라벨', async () => {
      userSettingService.getSettings.mockResolvedValue({
        contentReviewLastPromptedDate: '2026-10-27',
        contentReviewMutedUntil: '2026-11-02',
      });

      expect(await service.getPrompt(USER_ID, UserMarket.KR, NOW)).toEqual({
        enabled: true,
        show: false,
        item: null,
        rewardProgress: null,
        mutedUntil: '2026-11-02',
      });
    });
  });

  describe('dismissPrompt · mutePrompt (4.4 · 4.5)', () => {
    it('닫기는 오늘을 "물었다"로 적는다', async () => {
      await service.dismissPrompt(USER_ID, NOW);

      expect(userSettingService.updateSettings).toHaveBeenCalledWith(USER_ID, {
        contentReviewLastPromptedDate: '2026-10-29',
      });
    });

    it('같은 날 다시 닫으면 쓰지 않는다(뒤로 가지 않는다)', async () => {
      userSettingService.getSettings.mockResolvedValue({
        contentReviewLastPromptedDate: '2026-10-29',
        contentReviewMutedUntil: null,
      });

      await service.dismissPrompt(USER_ID, NOW);

      expect(userSettingService.updateSettings).not.toHaveBeenCalled();
    });

    it('그만 보기는 다음 주 월요일까지 막고 "물었다"도 함께 적는다', async () => {
      expect(await service.mutePrompt(USER_ID, NOW)).toEqual({
        mutedUntil: '2026-11-02',
      });
      expect(userSettingService.updateSettings).toHaveBeenCalledWith(USER_ID, {
        contentReviewMutedUntil: '2026-11-02',
        contentReviewLastPromptedDate: '2026-10-29',
      });
    });
  });

  describe('getAdminSummary (4.8)', () => {
    it('전체 평균은 후기 단위 가중 평균이다 — 편 평균의 평균이 아니다', async () => {
      repository.summarizeByContent.mockResolvedValue([
        { reviews: 3, starsSum: 15, textReviews: 1 },
        { reviews: 1, starsSum: 1, textReviews: 1 },
      ]);

      const summary = await service.getAdminSummary({
        contentId: null,
        market: null,
      });

      expect(summary.totals).toEqual({
        reviews: 4,
        averageStars: 4,
        textReviews: 2,
        reviewedContents: 2,
      });
      expect(summary.promotions).toEqual({
        issued: 0,
        redeemed: 0,
        expired: 0,
        unused: 0,
      });
    });

    it('후기가 없으면 평균은 null', async () => {
      const summary = await service.getAdminSummary({
        contentId: null,
        market: null,
      });

      expect(summary.totals.averageStars).toBeNull();
    });
  });
});
