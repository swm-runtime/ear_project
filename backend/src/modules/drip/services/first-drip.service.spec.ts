import { DataSource } from 'typeorm';

import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { FirstDripService } from './first-drip.service';
import { DripExclusionReason, FirstDripJobStatus } from '../drip.enum';
import { FirstDripJob } from '../entities/first-drip-job.entity';
import { DripExcludedContentRepository } from '../repositories/drip-excluded-content.repository';
import { FirstDripJobRepository } from '../repositories/first-drip-job.repository';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

function buildJob(): FirstDripJob {
  return {
    id: 'job-1',
    userId: USER_ID,
    status: FirstDripJobStatus.PENDING,
    attemptCount: 0,
    lastAttemptedAt: null,
    completedAt: null,
    itemCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } as FirstDripJob;
}

function buildContent(id: string): Content {
  return { id } as Content;
}

describe('FirstDripService', () => {
  let service: FirstDripService;
  let jobRepository: jest.Mocked<FirstDripJobRepository>;
  let excludedRepository: jest.Mocked<DripExcludedContentRepository>;
  let userService: jest.Mocked<UserService>;
  let planService: jest.Mocked<PlanService>;
  let userInterestService: jest.Mocked<UserInterestService>;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
  let job: FirstDripJob;

  beforeEach(() => {
    job = buildJob();

    jobRepository = {
      findByUserId: jest.fn().mockImplementation(() => Promise.resolve(job)),
      createIfAbsent: jest.fn(),
      save: jest.fn().mockImplementation((saved: FirstDripJob) => saved),
      claimRetryable: jest.fn(),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<FirstDripJobRepository>;

    excludedRepository = {
      findAllContentIdsByUserId: jest.fn().mockResolvedValue([]),
      insertIgnoringConflicts: jest.fn(),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<DripExcludedContentRepository>;

    userService = {
      getById: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, tier: UserTier.LIGHT }),
    } as unknown as jest.Mocked<UserService>;

    planService = {
      getDailyDripCount: jest.fn().mockResolvedValue(2),
      findByTier: jest.fn(),
    } as unknown as jest.Mocked<PlanService>;

    userInterestService = {
      findActiveTopicIds: jest.fn().mockResolvedValue([TOPIC_ID]),
    } as unknown as jest.Mocked<UserInterestService>;

    contentService = {
      findCandidates: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentService>;

    libraryService = {
      addItems: jest.fn().mockResolvedValue([]),
      findAllContentIds: jest.fn().mockResolvedValue([]),
      countBySource: jest.fn(),
    } as unknown as jest.Mocked<LibraryService>;

    const dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    service = new FirstDripService(
      jobRepository,
      excludedRepository,
      userService,
      planService,
      userInterestService,
      contentService,
      libraryService,
      dataSource,
    );
  });

  describe('schedule', () => {
    it('편성에 성공하면 completed와 적립 편수를 기록한다', async () => {
      // given
      contentService.findCandidates.mockResolvedValue([
        buildContent('content-1'),
        buildContent('content-2'),
      ]);

      // when
      await service.schedule(USER_ID, NOW);

      // then
      expect(job.status).toBe(FirstDripJobStatus.COMPLETED);
      expect(job.itemCount).toBe(2);
      expect(job.completedAt).toEqual(NOW);
    });

    it('적립하면서 드립 영구 제외 목록에도 함께 남긴다', async () => {
      // given — 재적립 방지의 근거다 (FR-16)
      contentService.findCandidates.mockResolvedValue([
        buildContent('content-1'),
      ]);

      // when
      await service.schedule(USER_ID, NOW);

      // then
      expect(libraryService.addItems).toHaveBeenCalledWith(
        USER_ID,
        ['content-1'],
        LibraryItemSource.DRIP,
        NOW,
        expect.anything(),
      );
      expect(excludedRepository.insertIgnoringConflicts).toHaveBeenCalledWith(
        [
          {
            userId: USER_ID,
            contentId: 'content-1',
            reason: DripExclusionReason.DRIPPED,
            excludedAt: NOW,
          },
        ],
        expect.anything(),
      );
    });

    it('후보가 하나도 없으면 실패가 아니라 no_candidates로 끝낸다', async () => {
      // given
      contentService.findCandidates.mockResolvedValue([]);

      // when
      await service.schedule(USER_ID, NOW);

      // then — 재시도해도 결과가 바뀌지 않는 종료 상태다
      expect(job.status).toBe(FirstDripJobStatus.NO_CANDIDATES);
      expect(job.itemCount).toBe(0);
      expect(libraryService.addItems).not.toHaveBeenCalled();
    });

    it('관심 주제가 없으면 편성하지 않는다', async () => {
      // given
      userInterestService.findActiveTopicIds.mockResolvedValue([]);

      // when
      await service.schedule(USER_ID, NOW);

      // then
      expect(job.status).toBe(FirstDripJobStatus.NO_CANDIDATES);
      expect(contentService.findCandidates).not.toHaveBeenCalled();
    });

    it('관심 주제 재고가 모자라면 인기 콘텐츠로 대체 편성해 편수를 채운다', async () => {
      // given — 라이브러리가 비는 것보다 관련성이 조금 낮은 편이 낫다
      contentService.findCandidates
        .mockResolvedValueOnce([buildContent('content-1')])
        .mockResolvedValueOnce([buildContent('content-9')]);

      // when
      await service.schedule(USER_ID, NOW);

      // then
      expect(job.itemCount).toBe(2);
      expect(libraryService.addItems).toHaveBeenCalledWith(
        USER_ID,
        ['content-1', 'content-9'],
        LibraryItemSource.DRIP,
        NOW,
        expect.anything(),
      );
    });

    it('이미 적립이 끝난 작업은 다시 편성하지 않는다', async () => {
      // given
      job.status = FirstDripJobStatus.COMPLETED;

      // when
      await service.schedule(USER_ID, NOW);

      // then
      expect(contentService.findCandidates).not.toHaveBeenCalled();
      expect(libraryService.addItems).not.toHaveBeenCalled();
    });

    it('라이브러리에 있거나 이미 제외된 콘텐츠를 후보에서 뺀다', async () => {
      // given
      libraryService.findAllContentIds.mockResolvedValue(['content-1']);
      excludedRepository.findAllContentIdsByUserId.mockResolvedValue([
        'content-2',
      ]);
      contentService.findCandidates.mockResolvedValue([
        buildContent('content-3'),
        buildContent('content-4'),
      ]);

      // when
      await service.schedule(USER_ID, NOW);

      // then
      const query = contentService.findCandidates.mock.calls[0][0];
      expect(query.excludeContentIds).toContain('content-1');
      expect(query.excludeContentIds).toContain('content-2');
    });
  });

  describe('runClaimed', () => {
    it('편성이 실패하면 큐로 되돌려 다음 주기에 다시 시도하게 한다', async () => {
      // given
      job.attemptCount = 4;
      contentService.findCandidates.mockRejectedValue(new Error('db down'));

      // when
      await service.runClaimed(USER_ID, NOW);

      // then
      expect(job.status).toBe(FirstDripJobStatus.QUEUED);
    });

    it('누적 시도 횟수를 소진하면 failed로 두고 더 재시도하지 않는다', async () => {
      // given — 무한 재시도는 장애를 늘린다
      job.attemptCount = 10;
      contentService.findCandidates.mockRejectedValue(new Error('db down'));

      // when
      await service.runClaimed(USER_ID, NOW);

      // then
      expect(job.status).toBe(FirstDripJobStatus.FAILED);
    });
  });
});
