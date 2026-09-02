import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { ContentCandidateQuery } from '@/modules/content/content.types';
import { DripBatchRunService } from '@/modules/drip/services/drip-batch-run.service';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { DripPlacementService } from '@/modules/drip/services/drip-placement.service';
import { DripScoringService } from '@/modules/drip/services/drip-scoring.service';
import { PreferenceVectorService } from '@/modules/drip/services/preference-vector.service';
import { DripBatchRun } from '@/modules/drip/entities/drip-batch-run.entity';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';

const NOW = new Date('2026-08-27T05:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';

function buildUser(id: string = USER_ID): User {
  return { id, tier: UserTier.LIGHT } as User;
}

function buildContent(id: string): Content {
  return {
    id,
    authorName: null,
    seriesId: null,
    episodeNo: null,
    durationSec: 600,
    difficulty: null,
    format: null,
    isEvergreen: null,
    keywords: null,
    publishedAt: NOW,
  } as Content;
}

describe('DripBatchOrchestrator', () => {
  let orchestrator: DripBatchOrchestrator;
  let userService: jest.Mocked<UserService>;
  let userInterestService: jest.Mocked<UserInterestService>;
  let planService: jest.Mocked<PlanService>;
  let contentService: jest.Mocked<ContentService>;
  let contentStatService: jest.Mocked<ContentStatService>;
  let libraryService: jest.Mocked<LibraryService>;
  let playbackService: jest.Mocked<PlaybackService>;
  let preferenceVectorService: jest.Mocked<PreferenceVectorService>;
  let dripPlacementService: jest.Mocked<DripPlacementService>;
  let dripExclusionService: jest.Mocked<DripExclusionService>;
  let dripBatchRunService: jest.Mocked<DripBatchRunService>;
  let run: DripBatchRun;

  // 정규 후보 2편(주제 A·B) + 탐험 후보 1편(주제 B — 관심 밖)
  const regularPool = [buildContent('r1'), buildContent('r2')];
  const discoveryPool = [buildContent('d1')];

  beforeEach(() => {
    run = { id: 'run-1', runDate: '2026-08-27' } as DripBatchRun;

    userService = {
      findDripTargetsPage: jest
        .fn()
        .mockResolvedValueOnce([buildUser()])
        .mockResolvedValue([]),
    } as unknown as jest.Mocked<UserService>;

    userInterestService = {
      findActiveTopicIds: jest.fn().mockResolvedValue([TOPIC_A]),
      findUserRemovedTopicIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserInterestService>;

    planService = {
      getDailyDripCount: jest.fn().mockResolvedValue(2),
      getDailyDiscoveryCount: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<PlanService>;

    contentService = {
      // 관심 주제 필터가 있으면 정규 풀, 없으면 탐험 풀이다 (4.8 — 교집합 필터 우회)
      findCandidates: jest
        .fn()
        .mockImplementation((query: ContentCandidateQuery) =>
          Promise.resolve(query.includeTopicIds ? regularPool : discoveryPool),
        ),
      findAllByIds: jest.fn().mockResolvedValue([]),
      findTopicViews: jest.fn().mockImplementation((contentIds: string[]) =>
        Promise.resolve(
          contentIds
            .filter((id) => ['r1', 'r2', 'd1'].includes(id))
            .map((contentId) => ({
              contentId,
              topicId: contentId === 'r1' ? TOPIC_A : TOPIC_B,
              name: 'topic',
            })),
        ),
      ),
    } as unknown as jest.Mocked<ContentService>;

    contentStatService = {
      findAllTimeCounts: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<ContentStatService>;

    libraryService = {
      countUnfinished: jest.fn().mockResolvedValue(0),
      findAllContentIds: jest.fn().mockResolvedValue([]),
      findCompletedSeriesMaxEpisodes: jest.fn().mockResolvedValue(new Map()),
      findRecentDripContentIds: jest.fn().mockResolvedValue([]),
      countExposures: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<LibraryService>;

    playbackService = {
      findRecentSignals: jest.fn().mockResolvedValue([]),
      countSignals: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PlaybackService>;

    preferenceVectorService = {
      rebuild: jest.fn().mockResolvedValue({
        topicWeights: {},
        authorWeights: {},
        keywordWeights: {},
        formatWeights: {},
        durationPref: null,
        signalCount: 0,
      }),
    } as unknown as jest.Mocked<PreferenceVectorService>;

    dripPlacementService = {
      placeItems: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DripPlacementService>;

    dripExclusionService = {
      findExcludedContentIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DripExclusionService>;

    dripBatchRunService = {
      claim: jest.fn().mockResolvedValue(run),
      finish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DripBatchRunService>;

    orchestrator = new DripBatchOrchestrator(
      userService,
      userInterestService,
      planService,
      contentService,
      contentStatService,
      libraryService,
      playbackService,
      preferenceVectorService,
      new DripScoringService(),
      dripPlacementService,
      dripExclusionService,
      dripBatchRunService,
    );
  });

  it('같은 서비스 날짜에 이미 선점된 배치는 다시 실행되지 않는다', async () => {
    dripBatchRunService.claim.mockResolvedValue(null);

    await orchestrator.run(NOW);

    expect(userService.findDripTargetsPage).not.toHaveBeenCalled();
    expect(dripBatchRunService.finish).not.toHaveBeenCalled();
  });

  it('관심 주제가 0개인 사용자는 편성 없이 건너뛴다', async () => {
    userInterestService.findActiveTopicIds.mockResolvedValue([]);

    await orchestrator.run(NOW);

    expect(dripPlacementService.placeItems).not.toHaveBeenCalled();
    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({ skippedCount: 1, successCount: 0 }),
      expect.any(Date),
    );
  });

  it('미청취 재고가 5편 이상이면 정규·탐험 모두 건너뛴다', async () => {
    libraryService.countUnfinished.mockResolvedValue(5);

    await orchestrator.run(NOW);

    expect(dripPlacementService.placeItems).not.toHaveBeenCalled();
    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({ skippedCount: 1 }),
      expect.any(Date),
    );
  });

  it('정규 2편은 drip으로, 탐험 1편은 discovery로 적립된다', async () => {
    await orchestrator.run(NOW);

    expect(dripPlacementService.placeItems).toHaveBeenCalledWith(
      USER_ID,
      expect.arrayContaining(['r1', 'r2']),
      LibraryItemSource.DRIP,
      NOW,
    );
    expect(dripPlacementService.placeItems).toHaveBeenCalledWith(
      USER_ID,
      ['d1'],
      LibraryItemSource.DISCOVERY,
      NOW,
    );
    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({ targetCount: 1, successCount: 1 }),
      expect.any(Date),
    );
  });

  it('탐험 풀 조회는 정규로 뽑힌 콘텐츠를 제외 목록에 포함한다', async () => {
    await orchestrator.run(NOW);

    const discoveryQuery = contentService.findCandidates.mock.calls
      .map(([query]) => query)
      .find((query) => !query.includeTopicIds);

    expect(discoveryQuery?.excludeContentIds).toEqual(
      expect.arrayContaining(['r1', 'r2']),
    );
  });

  it('탐험 편성이 실패해도 정규 적립은 유지되고 사용자는 성공으로 집계된다', async () => {
    dripPlacementService.placeItems.mockImplementation(
      (_userId, _contentIds, source) =>
        source === LibraryItemSource.DISCOVERY
          ? Promise.reject(new Error('discovery failed'))
          : Promise.resolve(),
    );

    await orchestrator.run(NOW);

    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({ successCount: 1, failedCount: 0 }),
      expect.any(Date),
    );
  });

  it('사용자 처리 실패는 다른 사용자에게 전파되지 않는다', async () => {
    userService.findDripTargetsPage
      .mockReset()
      .mockResolvedValueOnce([buildUser('failing'), buildUser(USER_ID)])
      .mockResolvedValue([]);
    userInterestService.findActiveTopicIds.mockImplementation(
      (userId: string) =>
        userId === 'failing'
          ? Promise.reject(new Error('boom'))
          : Promise.resolve([TOPIC_A]),
    );

    await orchestrator.run(NOW);

    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        targetCount: 2,
        successCount: 1,
        failedCount: 1,
      }),
      expect.any(Date),
    );
  });
});
