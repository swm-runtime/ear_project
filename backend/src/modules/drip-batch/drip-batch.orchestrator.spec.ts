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
import { DripArrivalNotificationService } from '@/modules/notification/services/drip-arrival-notification.service';
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
    title: `제목 ${id}`,
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
  let dripArrivalNotificationService: jest.Mocked<DripArrivalNotificationService>;
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
      findScorableEmbeddings: jest.fn().mockResolvedValue(new Map()),
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
      findIgnoredDripItems: jest.fn().mockResolvedValue([]),
      countExposures: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<LibraryService>;

    playbackService = {
      findRecentSignals: jest.fn().mockResolvedValue([]),
      countSignals: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PlaybackService>;

    const emptyWeights = {
      topicWeights: {},
      authorWeights: {},
      keywordWeights: {},
      formatWeights: {},
      durationPref: null,
      tasteEmbedding: null,
      signalCount: 0,
    };
    preferenceVectorService = {
      rebuild: jest.fn().mockResolvedValue(emptyWeights),
      compute: jest.fn().mockReturnValue(emptyWeights),
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

    dripArrivalNotificationService = {
      notify: jest.fn().mockResolvedValue({
        sentCount: 1,
        failedCount: 0,
        skippedCount: 0,
        invalidatedDeviceCount: 0,
      }),
    } as unknown as jest.Mocked<DripArrivalNotificationService>;

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
      dripArrivalNotificationService,
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

  it('미청취 재고로 적립을 건너뛴 사용자도 취향 캐시는 재계산한다 — 스킵은 적립 규칙이다(4.1·4.3)', async () => {
    // given — 재고 5편 이상이라 편성은 건너뛴다
    libraryService.countUnfinished.mockResolvedValue(5);

    // when
    await orchestrator.run(NOW);

    // then — 탐색 피드가 읽는 캐시는 그 사용자에게도 갱신된다
    expect(preferenceVectorService.rebuild).toHaveBeenCalledTimes(1);
    expect(dripPlacementService.placeItems).not.toHaveBeenCalled();
  });

  it('7일 넘게 열지 않은 드립은 "무시" 신호로 취향 재계산에 들어간다 — 시각은 적립 + 7일(4.3)', async () => {
    // given — 10일 전에 적립돼 아직 미청취인 드립 1편
    const addedAt = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
    libraryService.findIgnoredDripItems.mockResolvedValue([
      { contentId: 'r1', addedAt },
    ]);

    // when
    await orchestrator.run(NOW);

    // then — user_signals 에는 없는 파생 신호가 rebuild 입력에 합쳐진다
    const [, signals] = preferenceVectorService.rebuild.mock.calls[0];
    expect(signals).toEqual([
      {
        contentId: 'r1',
        action: 'ignore',
        createdAt: new Date(addedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    ]);
    // 조회 창은 "적립이 7일보다 오래된 것"이다
    expect(libraryService.findIgnoredDripItems).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Date),
      new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
    );
  });

  it('후보가 고갈된 사용자는 skipped가 아니라 exhausted로 집계된다 — 콘텐츠 수급 신호다', async () => {
    contentService.findCandidates.mockResolvedValue([]);

    await orchestrator.run(NOW);

    expect(dripPlacementService.placeItems).not.toHaveBeenCalled();
    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        targetCount: 1,
        successCount: 0,
        skippedCount: 0,
        exhaustedCount: 1,
        failedCount: 0,
      }),
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

  describe('planForUser — 편성 미리보기가 쓰는 계산 경로', () => {
    it('저장 없는 계산의 편성분이 실제 배치가 적립한 것과 같다 — 미리보기와 배치는 같은 계산기다', async () => {
      // given — 같은 입력으로 계산만 한다
      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        stopAtSkip: true,
      });

      // when — 실제 배치를 돌린다
      await orchestrator.run(NOW);

      // then — 정규·탐험 편성분이 적립 호출과 일치한다
      const placed = new Map(
        dripPlacementService.placeItems.mock.calls.map(
          ([, contentIds, source]) => [source, contentIds],
        ),
      );
      expect(plan.regular?.picks.map((pick) => pick.content.id)).toEqual(
        placed.get(LibraryItemSource.DRIP),
      );
      expect(plan.discovery?.picks.map((pick) => pick.content.id)).toEqual(
        placed.get(LibraryItemSource.DISCOVERY),
      );
    });

    it('persistPreference가 꺼져 있으면 취향 캐시를 저장하지 않고 적립도 하지 않는다', async () => {
      await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        stopAtSkip: false,
      });

      expect(preferenceVectorService.rebuild).not.toHaveBeenCalled();
      expect(preferenceVectorService.compute).toHaveBeenCalledTimes(1);
      expect(dripPlacementService.placeItems).not.toHaveBeenCalled();
      expect(dripBatchRunService.claim).not.toHaveBeenCalled();
      expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
    });

    it('stopAtSkip이 꺼져 있으면 스킵 사유를 적은 채 편성 계산까지 이어 간다 — "스킵이 아니었다면"을 보이기 위해', async () => {
      libraryService.countUnfinished.mockResolvedValue(5);

      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        stopAtSkip: false,
      });

      expect(plan.skipReason).toBe('unfinished_inventory');
      expect(plan.regular?.picks.map((pick) => pick.content.id)).toEqual(
        expect.arrayContaining(['r1', 'r2']),
      );
    });

    it('후보 전부의 점수와 시리즈 게이트에서 빠진 편을 함께 돌려준다', async () => {
      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        stopAtSkip: true,
      });

      expect(plan.regular?.poolSize).toBe(2);
      expect(plan.regular?.scored.map((c) => c.content.id).sort()).toEqual([
        'r1',
        'r2',
      ]);
      expect(plan.regular?.gatedOut).toEqual([]);
      expect(plan.discovery?.ranking.scored.map((c) => c.content.id)).toEqual([
        'd1',
      ]);
    });
  });

  it('티어별 편성 편수는 실행 1회에 한 번만 읽는다 — 사용자마다 plans를 다시 읽지 않는다', async () => {
    // given — 같은 티어의 사용자 3명
    userService.findDripTargetsPage
      .mockReset()
      .mockResolvedValueOnce([
        buildUser('u1'),
        buildUser('u2'),
        buildUser('u3'),
      ])
      .mockResolvedValue([]);

    // when
    await orchestrator.run(NOW);

    // then
    expect(planService.getDailyDripCount).toHaveBeenCalledTimes(1);
    expect(planService.getDailyDiscoveryCount).toHaveBeenCalledTimes(1);
    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({ targetCount: 3 }),
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

  describe('드립 도착 알림', () => {
    it('정규 편성과 탐험 편성이 끝난 뒤 두 적립분을 합쳐 알림에 넘긴다', async () => {
      // when
      await orchestrator.run(NOW);

      // then — 정규 + 탐험을 합친 하루 1건(notification.md 4.3)
      expect(dripArrivalNotificationService.notify).toHaveBeenCalledTimes(1);
      const [arrivals, at] =
        dripArrivalNotificationService.notify.mock.calls[0];
      expect(at).toBe(NOW);
      expect(arrivals).toEqual([
        {
          userId: USER_ID,
          regular: expect.arrayContaining([
            { contentId: 'r1', title: '제목 r1' },
            { contentId: 'r2', title: '제목 r2' },
          ]) as unknown,
          discovery: [{ contentId: 'd1', title: '제목 d1' }],
        },
      ]);
      expect(
        dripArrivalNotificationService.notify.mock.invocationCallOrder[0],
      ).toBeGreaterThan(
        Math.max(...dripPlacementService.placeItems.mock.invocationCallOrder),
      );
    });

    it('탐험 편성이 실패하면 정규 적립분만 넘긴다', async () => {
      // given
      dripPlacementService.placeItems.mockImplementation(
        (_userId, _contentIds, source) =>
          source === LibraryItemSource.DISCOVERY
            ? Promise.reject(new Error('discovery failed'))
            : Promise.resolve(),
      );

      // when
      await orchestrator.run(NOW);

      // then
      const [arrivals] = dripArrivalNotificationService.notify.mock.calls[0];
      expect(arrivals[0].regular).toHaveLength(2);
      expect(arrivals[0].discovery).toEqual([]);
    });

    it('정규 후보가 고갈돼 탐험 편만 적립돼도 알림에 넘긴다', async () => {
      // given — 관심 주제 풀만 비었다
      contentService.findCandidates.mockImplementation(
        (query: ContentCandidateQuery) =>
          Promise.resolve(query.includeTopicIds ? [] : discoveryPool),
      );

      // when
      await orchestrator.run(NOW);

      // then
      const [arrivals] = dripArrivalNotificationService.notify.mock.calls[0];
      expect(arrivals).toEqual([
        {
          userId: USER_ID,
          regular: [],
          discovery: [{ contentId: 'd1', title: '제목 d1' }],
        },
      ]);
    });

    it('적립이 없는 사용자는 알림에 넘기지 않는다', async () => {
      // given — 미청취 재고로 건너뛴다
      libraryService.countUnfinished.mockResolvedValue(5);

      // when
      await orchestrator.run(NOW);

      // then
      expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
    });

    it('알림이 실패해도 배치는 끝까지 돌고 편성 집계는 그대로다', async () => {
      // given — 적립은 이미 커밋됐다
      dripArrivalNotificationService.notify.mockRejectedValue(
        new Error('push down'),
      );

      // when
      await orchestrator.run(NOW);

      // then
      expect(dripBatchRunService.finish).toHaveBeenCalledWith(
        run,
        expect.objectContaining({ successCount: 1, failedCount: 0 }),
        expect.any(Date),
      );
    });

    it('사용자 페이지마다 한 번씩 모아서 넘긴다', async () => {
      // given — 페이지 두 개
      userService.findDripTargetsPage
        .mockReset()
        .mockResolvedValueOnce([buildUser('u1')])
        .mockResolvedValueOnce([buildUser('u2')])
        .mockResolvedValue([]);

      // when
      await orchestrator.run(NOW);

      // then
      expect(dripArrivalNotificationService.notify).toHaveBeenCalledTimes(2);
    });
  });
});
