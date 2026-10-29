import { ContentLengthProfile } from '@/modules/content/content.enum';
import { ContentCohortService } from '@/modules/content/services/content-cohort.service';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { ContentCandidateQuery } from '@/modules/content/content.types';
import { DripBatchRunService } from '@/modules/drip/services/drip-batch-run.service';
import { DripPlacementService } from '@/modules/drip/services/drip-placement.service';
import { DripScoringService } from '@/modules/drip/services/drip-scoring.service';
import { PreferenceVectorService } from '@/modules/drip/services/preference-vector.service';
import {
  DripArrivalSlot,
  dripArrivalBucketOf,
} from '@/modules/drip/drip-group.policy';
import { DripGroup } from '@/modules/drip/drip.enum';
import { MorningPushService } from '@/modules/retention-push/morning-push.service';
import { DripBatchRun } from '@/modules/drip/entities/drip-batch-run.entity';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { DripArrivalNotificationService } from '@/modules/notification/services/drip-arrival-notification.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { User } from '@/modules/user/entities/user.entity';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserMarket, UserTier } from '@/modules/user/user.enum';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import { READ_ONLY_PLAN_OPTIONS } from './drip-preview.service';

const NOW = new Date('2026-08-27T05:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';
const TOPIC_HIDDEN = 'dddddddd-1111-4111-8111-111111111111';

function buildUser(id: string = USER_ID): User {
  return { id, tier: UserTier.LIGHT, market: UserMarket.KR } as User;
}

function buildInterest(
  topicId: string,
  source: UserInterestSource = UserInterestSource.ONBOARDING,
  updatedAt: Date = new Date('2026-08-01T00:00:00.000Z'),
): UserInterest {
  return { topicId, source, isActive: true, updatedAt } as UserInterest;
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
  let dripBatchRunService: jest.Mocked<DripBatchRunService>;
  let dripArrivalNotificationService: jest.Mocked<DripArrivalNotificationService>;
  let topicService: jest.Mocked<TopicService>;
  let userSettingService: jest.Mocked<UserSettingService>;
  let morningPushService: jest.Mocked<MorningPushService>;
  /** 아침 알림 스위치(KAN-288) — 기본 꺼짐 */
  let morningActive = false;
  let run: DripBatchRun;

  // 정규 후보 2편(주제 A·B) + 탐험 후보 1편(주제 B — 관심 밖)
  const regularPool = [buildContent('r1'), buildContent('r2')];
  const discoveryPool = [buildContent('d1')];

  beforeEach(() => {
    run = {
      id: 'run-1',
      runDate: '2026-08-27',
      group: DripGroup.ASIA,
      // 2026-08-27 05:00:00.050 KST — 05:00 크론이 행을 만든 시각
      createdAt: new Date('2026-08-26T20:00:00.050Z'),
    } as DripBatchRun;

    userService = {
      findDripTargetsPage: jest
        .fn()
        .mockResolvedValueOnce([buildUser()])
        .mockResolvedValue([]),
    } as unknown as jest.Mocked<UserService>;

    userInterestService = {
      findAllActive: jest.fn().mockResolvedValue([buildInterest(TOPIC_A)]),
      findUserRemovedTopicIds: jest.fn().mockResolvedValue([]),
      findAutoExpandState: jest.fn().mockResolvedValue({
        userRemovedTopicIds: [],
        activeAutoExpandTopicIds: [],
      }),
      applyAutoExpand: jest
        .fn()
        .mockImplementation(
          (
            _userId: string,
            change: { addTopicId: string | null; removeTopicId: string | null },
          ) =>
            Promise.resolve({
              addedTopicId: change.addTopicId,
              removedTopicId: change.removeTopicId,
            }),
        ),
    } as unknown as jest.Mocked<UserInterestService>;

    topicService = {
      findAllByIds: jest
        .fn()
        .mockImplementation((ids: string[]) =>
          Promise.resolve(
            ids.map((id) => ({ id, isVisible: true, market: UserMarket.KR })),
          ),
        ),
    } as unknown as jest.Mocked<TopicService>;

    userSettingService = {
      getSettings: jest.fn().mockResolvedValue({ isAutoExpandEnabled: true }),
    } as unknown as jest.Mocked<UserSettingService>;

    planService = {
      getDailyDripCount: jest.fn().mockResolvedValue(2),
      getDailyDiscoveryCount: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<PlanService>;

    contentService = {
      // 시리즈 다음 편 판정 입력(KAN-134) — 기본은 시리즈 편 없음
      findSeriesEpisodeStates: jest.fn().mockResolvedValue(new Map()),
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
      countPlacedToday: jest.fn().mockResolvedValue(0),
      findCompletedSeriesMaxEpisodes: jest.fn().mockResolvedValue(new Map()),
      findRecentDripContentIds: jest.fn().mockResolvedValue([]),
      findPlacementsAddedBetween: jest.fn().mockResolvedValue([]),
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

    dripBatchRunService = {
      claim: jest.fn().mockResolvedValue(run),
      finish: jest.fn().mockResolvedValue(undefined),
      // 정상 배치처럼 05:00:10 KST 에 끝난 실행 — 07:00 크론이 보내는 경우다
      findByRunDateAndGroup: jest.fn().mockResolvedValue({
        ...run,
        finishedAt: new Date('2026-08-26T20:00:10.000Z'),
      }),
    } as unknown as jest.Mocked<DripBatchRunService>;

    dripArrivalNotificationService = {
      notify: jest.fn().mockResolvedValue({
        sentCount: 1,
        failedCount: 0,
        skippedCount: 0,
        invalidatedDeviceCount: 0,
      }),
    } as unknown as jest.Mocked<DripArrivalNotificationService>;

    morningActive = false;
    morningPushService = {
      isGroupActive: jest.fn(() => morningActive),
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MorningPushService>;

    // 스위치는 `true` 명시일 때만 켜진다(2026-10-14) — 자동 확장 테스트는 켜진 상태를 기본으로 본다
    orchestrator = createOrchestrator({ AUTO_EXPAND_ENABLED: 'true' });
  });

  function createOrchestrator(
    env: Record<string, string>,
  ): DripBatchOrchestrator {
    return new DripBatchOrchestrator(
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
      dripBatchRunService,
      dripArrivalNotificationService,
      topicService,
      userSettingService,
      { get: jest.fn((key: string) => env[key]) } as never,
      new ContentCohortService({
        get: (key: string) => env[key],
      } as never),
      morningPushService,
    );
  }

  it('같은 서비스 날짜에 이미 선점된 배치는 다시 실행되지 않는다', async () => {
    dripBatchRunService.claim.mockResolvedValue(null);

    await orchestrator.run(NOW);

    expect(userService.findDripTargetsPage).not.toHaveBeenCalled();
    expect(dripBatchRunService.finish).not.toHaveBeenCalled();
  });

  it('관심 주제가 0개인 사용자는 편성 없이 건너뛴다', async () => {
    userInterestService.findAllActive.mockResolvedValue([]);

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

  describe('행동 기반 자동 확장 (drip-scheduling 4.5)', () => {
    const DAY = 24 * 60 * 60 * 1000;

    /** 관심 밖 주제(TOPIC_B)의 서로 다른 콘텐츠 두 편을 최근에 완청한 사용자 */
    function givenOutsideInterestListener(): void {
      playbackService.findRecentSignals.mockResolvedValue([
        {
          contentId: 'x1',
          action: UserSignalAction.COMPLETE,
          createdAt: new Date(NOW.getTime() - DAY),
        },
        {
          contentId: 'x2',
          action: UserSignalAction.COMPLETE,
          createdAt: new Date(NOW.getTime() - 3 * DAY),
        },
      ]);
      contentService.findAllByIds.mockResolvedValue([
        buildContent('x1'),
        buildContent('x2'),
      ]);
      contentService.findTopicViews.mockImplementation((contentIds: string[]) =>
        Promise.resolve(
          contentIds.map((contentId) => ({
            contentId,
            topicId: contentId === 'r1' ? TOPIC_A : TOPIC_B,
            name: 'topic',
          })),
        ),
      );
      const weights = {
        topicWeights: { [TOPIC_B]: 1.8 },
        authorWeights: {},
        keywordWeights: {},
        formatWeights: {},
        durationPref: null,
        tasteEmbedding: null,
        signalCount: 2,
      };
      preferenceVectorService.rebuild.mockResolvedValue(weights);
      preferenceVectorService.compute.mockReturnValue(weights);
    }

    it('관심 밖 주제를 2편 완청한 사용자는 배치에서 그 주제가 자동 슬롯으로 붙고, 오늘 정규 후보도 그 주제를 포함해 조회된다', async () => {
      // given
      givenOutsideInterestListener();

      // when
      await orchestrator.run(NOW);

      // then
      expect(userInterestService.applyAutoExpand).toHaveBeenCalledWith(
        USER_ID,
        { addTopicId: TOPIC_B, removeTopicId: null },
        NOW,
      );
      const regularQuery = contentService.findCandidates.mock.calls
        .map(([query]) => query)
        .find((query) => query.includeTopicIds);
      expect(regularQuery?.includeTopicIds).toEqual([TOPIC_A, TOPIC_B]);
    });

    describe('짧은 판 코호트(KAN-298)', () => {
      const SINCE = '2026-09-01T00:00:00+09:00';
      const lengthProfilesQueried = () =>
        contentService.findCandidates.mock.calls.map(
          ([query]) => query.lengthProfile,
        );
      const plan = (createdAt: Date, env: Record<string, string>) =>
        createOrchestrator({ AUTO_EXPAND_ENABLED: 'true', ...env }).planForUser(
          { ...buildUser(), createdAt },
          NOW,
          new Map(),
          {
            persistPreference: false,
            persistAutoExpand: false,
            stopAtSkip: false,
            loadRecentDripTopics: false,
          },
        );

      it('경계 이후 가입자는 정규·탐험 후보를 short로만 조회한다', async () => {
        givenOutsideInterestListener();

        await plan(new Date('2026-09-02T00:00:00.000Z'), {
          SHORT_CONTENT_COHORT_SINCE: SINCE,
        });

        expect(lengthProfilesQueried().length).toBeGreaterThan(0);
        expect(new Set(lengthProfilesQueried())).toEqual(
          new Set([ContentLengthProfile.SHORT]),
        );
      });

      it('경계 전 가입자는 standard로만 조회한다', async () => {
        givenOutsideInterestListener();

        await plan(new Date('2026-08-01T00:00:00.000Z'), {
          SHORT_CONTENT_COHORT_SINCE: SINCE,
        });

        expect(new Set(lengthProfilesQueried())).toEqual(
          new Set([ContentLengthProfile.STANDARD]),
        );
      });

      it('경계 설정이 비면 경계 이후 가입자도 standard다 — 롤백 스위치', async () => {
        givenOutsideInterestListener();

        await plan(new Date('2026-09-02T00:00:00.000Z'), {});

        expect(new Set(lengthProfilesQueried())).toEqual(
          new Set([ContentLengthProfile.STANDARD]),
        );
      });
    });

    it('미리보기는 저장하지 않고 판정만 싣되, 편성은 바뀐 관심 주제로 계산한다', async () => {
      givenOutsideInterestListener();

      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        persistAutoExpand: false,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      expect(userInterestService.applyAutoExpand).not.toHaveBeenCalled();
      expect(plan.autoExpand).toMatchObject({
        action: 'add',
        reason: 'slot_free',
        addTopicId: TOPIC_B,
      });
      expect(plan.activeTopicIds).toEqual([TOPIC_A, TOPIC_B]);
    });

    it('READ_ONLY_PLAN_OPTIONS 계산은 조회 메서드만 부른다 — 자동 확장·취향 캐시·적립·배치 기록·알림 어느 쓰기도 없다(추천 검증)', async () => {
      // given — 자동 확장이 "추가"로 판정되는 사용자(저장 경로가 있는 분기를 일부러 지난다), 이메일·닉네임 없는 사용자 값
      givenOutsideInterestListener();
      const services: Record<string, object> = {
        userService,
        userInterestService,
        planService,
        contentService,
        contentStatService,
        libraryService,
        playbackService,
        preferenceVectorService,
        dripPlacementService,
        dripBatchRunService,
        dripArrivalNotificationService,
        topicService,
        userSettingService,
      };
      const readOnly = new Set([
        'userInterestService.findAllActive',
        'userInterestService.findAutoExpandState',
        'userInterestService.findUserRemovedTopicIds',
        'planService.getDailyDripCount',
        'planService.getDailyDiscoveryCount',
        'contentService.findCandidates',
        'contentService.findAllByIds',
        'contentService.findScorableEmbeddings',
        'contentService.findTopicViews',
        'contentService.findSeriesEpisodeStates',
        'contentStatService.findAllTimeCounts',
        'libraryService.countUnfinished',
        'libraryService.countPlacedToday',
        'libraryService.findCompletedSeriesMaxEpisodes',
        'libraryService.findRecentDripContentIds',
        'libraryService.findPlacementsAddedBetween',
        'libraryService.findIgnoredDripItems',
        'libraryService.countExposures',
        'playbackService.findRecentSignals',
        'playbackService.countSignals',
        'preferenceVectorService.compute',
        'topicService.findAllByIds',
        'userSettingService.getSettings',
      ]);

      // when
      const plan = await orchestrator.planForUser(
        {
          id: USER_ID,
          tier: UserTier.LIGHT,
          market: UserMarket.KR,
          jobCategory: null,
          yearsOfExperience: null,
          createdAt: NOW,
        },
        NOW,
        new Map(),
        READ_ONLY_PLAN_OPTIONS,
      );

      // then — 불린 메서드가 전부 조회 허용 목록 안이다. 새 의존이 생기면 이 목록에 판단을 거쳐 더해야 통과한다
      const called = Object.entries(services).flatMap(([name, service]) =>
        Object.entries(service)
          .filter(
            ([, fn]) => jest.isMockFunction(fn) && fn.mock.calls.length > 0,
          )
          .map(([method]) => `${name}.${method}`),
      );
      expect(called.filter((call) => !readOnly.has(call))).toEqual([]);
      expect(userInterestService.applyAutoExpand).not.toHaveBeenCalled();
      expect(preferenceVectorService.rebuild).not.toHaveBeenCalled();
      expect(plan.autoExpand?.action).toBe('add');
      expect(plan.regular?.picks.length).toBeGreaterThan(0);
    });

    it('자동 확장을 끈 사용자는 넣지도 빼지도 않는다', async () => {
      givenOutsideInterestListener();
      userSettingService.getSettings.mockResolvedValue({
        isAutoExpandEnabled: false,
      } as never);

      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: true,
        persistAutoExpand: true,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      expect(plan.autoExpand).toMatchObject({
        action: 'none',
        reason: 'disabled',
      });
      expect(userInterestService.applyAutoExpand).not.toHaveBeenCalled();
      expect(plan.activeTopicIds).toEqual([TOPIC_A]);
    });

    it('서버 스위치가 꺼져 있으면(운영 기본) 후보는 싣되 넣지 않는다 — 앱이 준비되기 전에 관심 주제가 바뀌지 않는다', async () => {
      givenOutsideInterestListener();
      const production = new DripBatchOrchestrator(
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
        dripBatchRunService,
        dripArrivalNotificationService,
        topicService,
        userSettingService,
        {
          // 비어 있으면 환경이 development 여도 꺼진다 — `true` 명시만 켠다(2026-10-14)
          get: jest.fn((key: string) =>
            key === 'SENTRY_ENVIRONMENT' ? 'development' : undefined,
          ),
        } as never,
        new ContentCohortService({ get: () => undefined } as never),
        morningPushService,
      );

      const plan = await production.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: true,
        persistAutoExpand: true,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      expect(plan.autoExpand).toMatchObject({
        action: 'none',
        reason: 'feature_off',
      });
      expect(plan.autoExpand?.candidates).toHaveLength(1);
      expect(userInterestService.applyAutoExpand).not.toHaveBeenCalled();
      expect(userSettingService.getSettings).not.toHaveBeenCalled();
    });

    it('후보 주제가 숨겨져 있으면 넣지 않는다 — 숨김 주제는 관심사 조회에서 걸러져 유령 행이 된다', async () => {
      givenOutsideInterestListener();
      topicService.findAllByIds.mockResolvedValue([
        { id: TOPIC_B, isVisible: false, market: UserMarket.KR },
      ] as never);

      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: true,
        persistAutoExpand: true,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      expect(plan.autoExpand?.action).toBe('none');
      expect(userInterestService.applyAutoExpand).not.toHaveBeenCalled();
    });

    it('후보 주제가 다른 시장이면 넣지 않는다 — 시장 전환 뒤 이전 시장 청취가 이전 시장 주제를 되살리지 않는다(global-api 4.5)', async () => {
      // given — KR 사용자의 관심사 밖 청취가 가리키는 주제가 GLOBAL 주제다
      givenOutsideInterestListener();
      topicService.findAllByIds.mockResolvedValue([
        { id: TOPIC_B, isVisible: true, market: UserMarket.GLOBAL },
      ] as never);

      // when
      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: true,
        persistAutoExpand: true,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      // then
      expect(plan.autoExpand?.action).toBe('none');
      expect(userInterestService.applyAutoExpand).not.toHaveBeenCalled();
      expect(plan.activeTopicIds).toEqual([TOPIC_A]);
    });

    it('숨김 주제가 차지한 자동 슬롯은 비우고, 후보가 있으면 같은 배치에서 그 자리를 채운다', async () => {
      // given — 활성 자동 슬롯이 있는데 `findAllActive`(노출 중만)에는 없다 = 주제가 숨겨졌다
      givenOutsideInterestListener();
      userInterestService.findAutoExpandState.mockResolvedValue({
        userRemovedTopicIds: [],
        activeAutoExpandTopicIds: [TOPIC_HIDDEN],
      });

      // when
      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: true,
        persistAutoExpand: true,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      // then
      expect(plan.autoExpand).toMatchObject({
        action: 'replace',
        reason: 'slot_hidden',
        addTopicId: TOPIC_B,
        removeTopicId: TOPIC_HIDDEN,
      });
      expect(userInterestService.applyAutoExpand).toHaveBeenCalledWith(
        USER_ID,
        { addTopicId: TOPIC_B, removeTopicId: TOPIC_HIDDEN },
        NOW,
      );
      expect(plan.activeTopicIds).toEqual([TOPIC_A, TOPIC_B]);
    });

    it('숨김 슬롯을 대신할 후보가 없으면 슬롯만 비운다 — 자동 주제 없이 편성한다', async () => {
      // given — 관심 밖 완청이 없는 사용자
      userInterestService.findAutoExpandState.mockResolvedValue({
        userRemovedTopicIds: [],
        activeAutoExpandTopicIds: [TOPIC_HIDDEN],
      });

      // when
      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: true,
        persistAutoExpand: true,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      // then
      expect(plan.autoExpand).toMatchObject({
        action: 'expire',
        reason: 'slot_hidden',
        addTopicId: null,
        removeTopicId: TOPIC_HIDDEN,
      });
      expect(userInterestService.applyAutoExpand).toHaveBeenCalledWith(
        USER_ID,
        { addTopicId: null, removeTopicId: TOPIC_HIDDEN },
        NOW,
      );
      expect(plan.activeTopicIds).toEqual([TOPIC_A]);
    });

    it('후보도 자동 슬롯도 없는 사용자에게는 주제·설정 조회를 하지 않는다 — 배치의 추가 쿼리가 0이다', async () => {
      await orchestrator.run(NOW);

      expect(topicService.findAllByIds).not.toHaveBeenCalled();
      expect(userSettingService.getSettings).not.toHaveBeenCalled();
      expect(userInterestService.applyAutoExpand).not.toHaveBeenCalled();
    });

    it('저장 시점에 실제로 반영되지 않은 추가(사용자가 그 사이 직접 해제)는 편성 주제에 넣지 않는다', async () => {
      givenOutsideInterestListener();
      userInterestService.applyAutoExpand.mockResolvedValue({
        addedTopicId: null,
        removedTopicId: null,
      });

      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: true,
        persistAutoExpand: true,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      expect(plan.activeTopicIds).toEqual([TOPIC_A]);
    });

    it('refreshDerivedState — 테스트 콘솔은 취향 캐시 저장과 자동 확장 적용을 배치와 같은 함수로 앞당긴다', async () => {
      givenOutsideInterestListener();

      const decision = await orchestrator.refreshDerivedState(
        USER_ID,
        UserMarket.KR,
        NOW,
      );

      expect(preferenceVectorService.rebuild).toHaveBeenCalledTimes(1);
      expect(decision.action).toBe('add');
      expect(userInterestService.applyAutoExpand).toHaveBeenCalledWith(
        USER_ID,
        { addTopicId: TOPIC_B, removeTopicId: null },
        NOW,
      );
      expect(dripPlacementService.placeItems).not.toHaveBeenCalled();
    });
  });

  describe('planForUser — 편성 미리보기가 쓰는 계산 경로', () => {
    it('저장 없는 계산의 편성분이 실제 배치가 적립한 것과 같다 — 미리보기와 배치는 같은 계산기다', async () => {
      // given — 같은 입력으로 계산만 한다
      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        persistAutoExpand: false,
        stopAtSkip: true,
        loadRecentDripTopics: false,
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

    it('최근 편성 주제(미리보기 표시용)는 미리보기에서만 조회하고 배치는 건너뛴다 — 스코어링 입력이 아니다', async () => {
      // when — 배치
      await orchestrator.run(NOW);

      // then
      expect(libraryService.findRecentDripContentIds).not.toHaveBeenCalled();

      // when — 미리보기
      await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        persistAutoExpand: false,
        stopAtSkip: false,
        loadRecentDripTopics: true,
      });

      // then
      expect(libraryService.findRecentDripContentIds).toHaveBeenCalledTimes(1);
    });

    it('persistPreference가 꺼져 있으면 취향 캐시를 저장하지 않고 적립도 하지 않는다', async () => {
      await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        persistAutoExpand: false,
        stopAtSkip: false,
        loadRecentDripTopics: false,
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
        persistAutoExpand: false,
        stopAtSkip: false,
        loadRecentDripTopics: false,
      });

      expect(plan.skipReason).toBe('unfinished_inventory');
      expect(plan.regular?.picks.map((pick) => pick.content.id)).toEqual(
        expect.arrayContaining(['r1', 'r2']),
      );
    });

    it('후보 전부의 점수와 시리즈 게이트에서 빠진 편을 함께 돌려준다', async () => {
      const plan = await orchestrator.planForUser(buildUser(), NOW, new Map(), {
        persistPreference: false,
        persistAutoExpand: false,
        stopAtSkip: true,
        loadRecentDripTopics: false,
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

    it('1화를 완청했고 2화가 회수됐으면 3화가 연속 편으로 우선 선정된다 — 노출 중 편과 사용자 상태를 카탈로그에서 묻는다(KAN-134)', async () => {
      // given — 풀에는 3·4화와 단일 콘텐츠, 카탈로그에 노출 중인 편은 1·3·4화(2화 회수)
      const episode = (id: string, episodeNo: number) =>
        ({ ...buildContent(id), seriesId: 's1', episodeNo }) as Content;
      contentService.findCandidates.mockImplementation(
        (query: ContentCandidateQuery) =>
          Promise.resolve(
            query.includeTopicIds
              ? [episode('e3', 3), episode('e4', 4), buildContent('r1')]
              : discoveryPool,
          ),
      );
      const state = (episodeNo: number, received = false) => ({
        contentId: `e${episodeNo}`,
        episodeNo,
        received,
        held: false,
        excluded: false,
      });
      contentService.findSeriesEpisodeStates.mockResolvedValue(
        new Map([['s1', [state(1, true), state(3), state(4)]]]),
      );
      libraryService.findCompletedSeriesMaxEpisodes.mockResolvedValue(
        new Map([['s1', 1]]),
      );

      // when
      const user = { ...buildUser(), market: UserMarket.KR } as User;
      const plan = await orchestrator.planForUser(user, NOW, new Map(), {
        persistPreference: false,
        persistAutoExpand: false,
        stopAtSkip: true,
        loadRecentDripTopics: false,
      });

      // then
      expect(contentService.findSeriesEpisodeStates).toHaveBeenCalledWith(
        ['s1', 's1'],
        USER_ID,
        NOW,
        UserMarket.KR,
      );
      expect(plan.regular?.gatedOut.map((c) => c.content.id)).toEqual(['e4']);
      expect(plan.regular?.picks[0].content.id).toBe('e3');
      expect(plan.regular?.picks[0].isSeriesContinuation).toBe(true);
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

  it('오늘 이미 편성된 사용자는 already_placed로 건너뛴다 — 재실행이 같은 사용자에게 또 주지 않는다(4.6-5)', async () => {
    libraryService.countPlacedToday.mockResolvedValue(3);

    await orchestrator.run(NOW);

    expect(dripPlacementService.placeItems).not.toHaveBeenCalled();
    // 적립 규칙이라 취향 캐시는 그래도 재계산한다(4.3)
    expect(preferenceVectorService.rebuild).toHaveBeenCalled();
    expect(dripBatchRunService.finish).toHaveBeenCalledWith(
      run,
      expect.objectContaining({
        targetCount: 1,
        skippedCount: 1,
        successCount: 0,
      }),
      expect.any(Date),
    );
  });

  it('사용자 편성이 한 번 던지면 잠깐 뒤 한 번 더 시도한다 — 일시 오류는 failed로 남지 않는다', async () => {
    jest.useFakeTimers();
    userInterestService.findAllActive
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValue([buildInterest(TOPIC_A)]);

    try {
      const pending = orchestrator.run(NOW);
      await jest.advanceTimersByTimeAsync(2_000);
      await pending;

      expect(dripBatchRunService.finish).toHaveBeenCalledWith(
        run,
        expect.objectContaining({ successCount: 1, failedCount: 0 }),
        expect.any(Date),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('사용자 페이지 조회가 계속 실패하면 실행 기록을 닫지 않고 던진다 — 다음 재시작 때 재개된다', async () => {
    jest.useFakeTimers();
    userService.findDripTargetsPage
      .mockReset()
      .mockRejectedValue(new Error('db down'));

    try {
      const pending = orchestrator.run(NOW);
      const assertion = expect(pending).rejects.toThrow('db down');
      await jest.advanceTimersByTimeAsync(10_000);
      await assertion;

      expect(dripBatchRunService.finish).not.toHaveBeenCalled();
      expect(userService.findDripTargetsPage).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('재시작 재개는 미완료 실행을 나이와 무관하게 집고, 없으면 아무 일도 하지 않는다', async () => {
    dripBatchRunService.claim.mockResolvedValue(null);

    await orchestrator.run(NOW, 'resume');

    expect(dripBatchRunService.claim).toHaveBeenCalledWith(
      expect.any(String),
      DripGroup.ASIA,
      NOW,
      { reclaimUnfinished: true },
    );
    expect(userService.findDripTargetsPage).not.toHaveBeenCalled();
    expect(dripBatchRunService.finish).not.toHaveBeenCalled();
  });

  it('05:00 정규 실행은 오래된 미완료 행만 다시 집는다', async () => {
    await orchestrator.run(NOW);

    expect(dripBatchRunService.claim).toHaveBeenCalledWith(
      expect.any(String),
      DripGroup.ASIA,
      NOW,
      { reclaimUnfinished: false },
    );
  });

  it('사용자 처리 실패는 다른 사용자에게 전파되지 않는다 — 두 번째 시도도 실패하면 failed로 센다', async () => {
    jest.useFakeTimers();
    userService.findDripTargetsPage
      .mockReset()
      .mockResolvedValueOnce([buildUser('failing'), buildUser(USER_ID)])
      .mockResolvedValue([]);
    userInterestService.findAllActive.mockImplementation((userId: string) =>
      userId === 'failing'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve([buildInterest(TOPIC_A)]),
    );

    try {
      const pending = orchestrator.run(NOW);
      await jest.advanceTimersByTimeAsync(2_000);
      await pending;

      expect(dripBatchRunService.finish).toHaveBeenCalledWith(
        run,
        expect.objectContaining({
          targetCount: 2,
          successCount: 1,
          failedCount: 1,
        }),
        expect.any(Date),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  describe('드립 도착 알림 — 07:00 KST(편성 05:00과 분리, 2026-10-14)', () => {
    /** 2026-08-27 05:00 KST — 정규 배치 시각 */
    const AT_0500 = new Date('2026-08-26T20:00:00.000Z');
    /** 2026-08-27 07:00 KST — 알림 시각 */
    const AT_0700 = new Date('2026-08-26T22:00:00.000Z');
    const placement = (
      userId: string,
      contentId: string,
      source: LibraryItemSource,
    ) =>
      ({
        userId,
        contentId,
        source,
        content: { title: `제목 ${contentId}` },
      }) as never;

    it('05:00 배치는 편성만 하고 알림은 보내지 않는다', async () => {
      await orchestrator.run(AT_0500);

      expect(dripPlacementService.placeItems).toHaveBeenCalled();
      expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
    });

    it('07:00 에 그날 배치가 적립한 것을 사용자별로 정규·탐험 합쳐 1건씩 넘긴다', async () => {
      // given
      libraryService.findPlacementsAddedBetween.mockResolvedValue([
        placement('u1', 'r1', LibraryItemSource.DRIP),
        placement('u1', 'r2', LibraryItemSource.DRIP),
        placement('u1', 'd1', LibraryItemSource.DISCOVERY),
        placement('u2', 'd2', LibraryItemSource.DISCOVERY),
      ]);

      // when
      await orchestrator.notifyTodayArrivals(AT_0700);

      // then — 범위는 그 그룹 실행 기록이 생긴 시각부터 배치 종료까지
      const [start, end] =
        libraryService.findPlacementsAddedBetween.mock.calls[0];
      expect(start).toEqual(run.createdAt);
      expect(end.getTime()).toBe(
        new Date('2026-08-26T20:00:10.000Z').getTime() + 1,
      );
      expect(dripArrivalNotificationService.notify).toHaveBeenCalledTimes(1);
      const [arrivals, at] =
        dripArrivalNotificationService.notify.mock.calls[0];
      expect(at).toBe(AT_0700);
      expect(arrivals).toEqual([
        {
          userId: 'u1',
          regular: [
            { contentId: 'r1', title: '제목 r1' },
            { contentId: 'r2', title: '제목 r2' },
          ],
          discovery: [{ contentId: 'd1', title: '제목 d1' }],
        },
        {
          userId: 'u2',
          regular: [],
          discovery: [{ contentId: 'd2', title: '제목 d2' }],
        },
      ]);
    });

    it('오늘 배치가 아직 끝나지 않았으면 보내지 않는다 — 끝날 때 배치가 이어서 보낸다', async () => {
      dripBatchRunService.findByRunDateAndGroup.mockResolvedValue({
        ...run,
        finishedAt: null,
      });

      await orchestrator.notifyTodayArrivals(AT_0700);

      expect(libraryService.findPlacementsAddedBetween).not.toHaveBeenCalled();
      expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
    });

    it('적립이 하나도 없으면 알림 서비스를 부르지 않는다', async () => {
      await orchestrator.notifyTodayArrivals(AT_0700);

      expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
    });

    it('사용자 100명 단위로 나눠 넘긴다', async () => {
      libraryService.findPlacementsAddedBetween.mockResolvedValue(
        Array.from({ length: 150 }, (_, i) =>
          placement(`u${i}`, `r${i}`, LibraryItemSource.DRIP),
        ),
      );

      await orchestrator.notifyTodayArrivals(AT_0700);

      expect(dripArrivalNotificationService.notify).toHaveBeenCalledTimes(2);
      expect(
        dripArrivalNotificationService.notify.mock.calls.map(
          ([arrivals]) => arrivals.length,
        ),
      ).toEqual([100, 50]);
    });

    it('알림이 실패해도 던지지 않는다 — 적립은 이미 커밋됐다', async () => {
      libraryService.findPlacementsAddedBetween.mockResolvedValue([
        placement('u1', 'r1', LibraryItemSource.DRIP),
      ]);
      dripArrivalNotificationService.notify.mockRejectedValue(
        new Error('push down'),
      );

      await expect(
        orchestrator.notifyTodayArrivals(AT_0700),
      ).resolves.toBeUndefined();
    });

    describe('배치가 끝난 시각이 07:00 뒤면 끝나자마자 보낸다 — 07:00 크론은 미완료 실행을 건너뛴다', () => {
      /** 실제 시계(`new Date()`)로 끝난 시각을 판정하므로 시계를 고정한다 */
      const freezeClockAt = (at: Date) =>
        jest
          .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
          .setSystemTime(at);

      beforeEach(() => {
        libraryService.findPlacementsAddedBetween.mockResolvedValue([
          placement(USER_ID, 'r1', LibraryItemSource.DRIP),
        ]);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('07:00 이 지나 시작된 배치(재시작 뒤 재개 등)는 끝나자마자 알림까지 보낸다', async () => {
        // given
        freezeClockAt(AT_0700);

        // when
        await orchestrator.run(AT_0700);

        // then
        expect(dripArrivalNotificationService.notify).toHaveBeenCalledTimes(1);
        expect(
          dripArrivalNotificationService.notify.mock.invocationCallOrder[0],
        ).toBeGreaterThan(
          dripBatchRunService.finish.mock.invocationCallOrder[0],
        );
      });

      it('05:00 에 시작해 07:00 을 넘겨 끝난 배치도 끝나자마자 보낸다 — 시작 시각이 아니라 끝난 시각으로 본다', async () => {
        // given — 대상 조회 중에 시계가 07:10 으로 넘어간다(오래 걸린 배치)
        freezeClockAt(AT_0500);
        userService.findDripTargetsPage
          .mockReset()
          .mockImplementationOnce(() => {
            jest.setSystemTime(new Date(AT_0700.getTime() + 10 * 60_000));
            return Promise.resolve([buildUser()]);
          })
          .mockResolvedValue([]);

        // when
        await orchestrator.run(AT_0500);

        // then
        expect(dripArrivalNotificationService.notify).toHaveBeenCalledTimes(1);
      });

      it('07:00 뒤에 끝난 실행은 07:00 크론이 건너뛴다 — 배치가 끝나면서 보내 정확히 한쪽만 보낸다', async () => {
        // given — 07:10 KST 에 끝난 실행
        dripBatchRunService.findByRunDateAndGroup.mockResolvedValue({
          ...run,
          finishedAt: new Date(AT_0700.getTime() + 10 * 60_000),
        });

        // when — 크론 경로
        await orchestrator.notifyTodayArrivals(AT_0700);

        // then
        expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
      });

      it('07:00 전에 끝난 배치는 보내지 않는다 — 07:00 크론이 보낸다', async () => {
        // given
        freezeClockAt(AT_0500);

        // when
        await orchestrator.run(AT_0500);

        // then
        expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
      });
    });
  });

  describe('도착 알림 시각 A/B(KAN-289 — DRIP_ARRIVAL_AB_ENABLED)', () => {
    /** 2026-08-27 05:00 KST */
    const AT_0500 = new Date('2026-08-26T20:00:00.000Z');
    const AT_0700 = new Date('2026-08-26T22:00:00.000Z');
    const AT_0730 = new Date('2026-08-26T22:30:00.000Z');
    const AT_0800 = new Date('2026-08-26T23:00:00.000Z');
    /** 그룹 A(07:30)·B(08:00)에 드는 사용자 id 를 하나씩 고른다 — 해시라 값으로 고정하지 않고 찾는다 */
    const userInBucket = (bucket: number) =>
      Array.from({ length: 100 }, (_, i) => `user-${i}`).find(
        (id) => dripArrivalBucketOf(id) === bucket,
      ) as string;
    const USER_A = userInBucket(0);
    const USER_B = userInBucket(1);
    const placement = (userId: string, contentId: string) =>
      ({
        userId,
        contentId,
        source: LibraryItemSource.DRIP,
        content: { title: `제목 ${contentId}` },
      }) as never;
    const notifiedUsers = () =>
      dripArrivalNotificationService.notify.mock.calls.map(
        ([arrivals, , , variant]) => [
          arrivals.map((arrival) => arrival.userId),
          variant,
        ],
      );

    beforeEach(() => {
      libraryService.findPlacementsAddedBetween.mockResolvedValue([
        placement(USER_A, 'r1'),
        placement(USER_B, 'r2'),
      ]);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('스위치가 꺼져 있으면 07:00 크론이 전원에게 보내고(종류 그대로) 07:30·08:00 크론은 아무것도 하지 않는다', async () => {
      // given
      orchestrator = createOrchestrator({});

      // when
      await orchestrator.notifyTodayArrivals(
        AT_0730,
        DripGroup.ASIA,
        DripArrivalSlot.H0730,
      );
      await orchestrator.notifyTodayArrivals(
        AT_0800,
        DripGroup.ASIA,
        DripArrivalSlot.H0800,
      );
      expect(dripBatchRunService.findByRunDateAndGroup).not.toHaveBeenCalled();
      await orchestrator.notifyTodayArrivals(AT_0700);

      // then
      expect(notifiedUsers()).toEqual([[[USER_A, USER_B], null]]);
    });

    it('스위치가 켜져 있으면 07:00 크론은 쉬고, 07:30 은 A 그룹 · 08:00 은 B 그룹에게만 그룹 표기와 함께 보낸다', async () => {
      // given
      orchestrator = createOrchestrator({ DRIP_ARRIVAL_AB_ENABLED: 'true' });

      // when
      await orchestrator.notifyTodayArrivals(AT_0700);
      await orchestrator.notifyTodayArrivals(
        AT_0730,
        DripGroup.ASIA,
        DripArrivalSlot.H0730,
      );
      await orchestrator.notifyTodayArrivals(
        AT_0800,
        DripGroup.ASIA,
        DripArrivalSlot.H0800,
      );

      // then
      expect(notifiedUsers()).toEqual([
        [[USER_A], 'a'],
        [[USER_B], 'b'],
      ]);
    });

    it('`true` 가 아니면(빈 값·false·대소문자 다름) 꺼짐이다', async () => {
      for (const value of ['', 'false', 'TRUE']) {
        dripArrivalNotificationService.notify.mockClear();
        orchestrator = createOrchestrator({ DRIP_ARRIVAL_AB_ENABLED: value });

        await orchestrator.notifyTodayArrivals(
          AT_0730,
          DripGroup.ASIA,
          DripArrivalSlot.H0730,
        );

        expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
      }
    });

    it('07:30 과 08:00 사이에 끝난 배치는 끝나자마자 A 그룹을 보내고, B 그룹은 08:00 크론에 남긴다', async () => {
      // given — 대상 조회 중에 시계가 07:45 로 넘어간다
      orchestrator = createOrchestrator({ DRIP_ARRIVAL_AB_ENABLED: 'true' });
      jest
        .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
        .setSystemTime(AT_0500);
      const finishedAt = new Date(AT_0730.getTime() + 15 * 60_000);
      userService.findDripTargetsPage
        .mockReset()
        .mockImplementationOnce(() => {
          jest.setSystemTime(finishedAt);
          return Promise.resolve([buildUser()]);
        })
        .mockResolvedValue([]);

      // when — 배치 종료
      await orchestrator.run(AT_0500);

      // then — A 그룹만
      expect(notifiedUsers()).toEqual([[[USER_A], 'a']]);

      // when — 크론: 07:30 은 배치가 맡았으니 건너뛰고, 08:00 은 B 그룹을 보낸다
      dripBatchRunService.findByRunDateAndGroup.mockResolvedValue({
        ...run,
        finishedAt,
      });
      await orchestrator.notifyTodayArrivals(
        AT_0730,
        DripGroup.ASIA,
        DripArrivalSlot.H0730,
      );
      await orchestrator.notifyTodayArrivals(
        AT_0800,
        DripGroup.ASIA,
        DripArrivalSlot.H0800,
      );

      // then
      expect(notifiedUsers()).toEqual([
        [[USER_A], 'a'],
        [[USER_B], 'b'],
      ]);
    });

    it('08:00 뒤에 끝난 배치는 두 그룹을 끝나자마자 각자의 표기로 보낸다', async () => {
      // given
      orchestrator = createOrchestrator({ DRIP_ARRIVAL_AB_ENABLED: 'true' });
      jest
        .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
        .setSystemTime(new Date(AT_0800.getTime() + 60_000));

      // when
      await orchestrator.run(AT_0800);

      // then
      expect(notifiedUsers()).toEqual([
        [[USER_A], 'a'],
        [[USER_B], 'b'],
      ]);
    });

    describe('아침 알림(KAN-288) — 08:00 크론 안에서, 드립이 없는 날만', () => {
      it('스위치가 켜져 있으면 A/B 가 꺼져 있어도 08:00 크론이 아침 알림을 부르고, 오늘 적립받은 사용자를 넘긴다', async () => {
        // given
        orchestrator = createOrchestrator({});
        morningActive = true;

        // when
        await orchestrator.notifyTodayArrivals(
          AT_0800,
          DripGroup.ASIA,
          DripArrivalSlot.H0800,
        );

        // then — 도착 알림은 07:00 몫이라 보내지 않는다
        expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
        expect(morningPushService.run).toHaveBeenCalledTimes(1);
        const [group, at, placed] = morningPushService.run.mock.calls[0];
        expect(group).toBe(DripGroup.ASIA);
        expect(at).toBe(AT_0800);
        expect([...placed].sort()).toEqual([USER_A, USER_B].sort());
      });

      it('07:00 · 07:30 크론에서는 부르지 않는다 — 광고성이라 08:00 전에 보내지 않는다', async () => {
        // given
        orchestrator = createOrchestrator({ DRIP_ARRIVAL_AB_ENABLED: 'true' });
        morningActive = true;

        // when
        await orchestrator.notifyTodayArrivals(AT_0700);
        await orchestrator.notifyTodayArrivals(
          AT_0730,
          DripGroup.ASIA,
          DripArrivalSlot.H0730,
        );

        // then
        expect(morningPushService.run).not.toHaveBeenCalled();
      });

      it('A/B 가 켜져 있으면 08:00 에 B 그룹 도착 알림을 먼저 보내고 아침 알림을 부른다', async () => {
        // given
        orchestrator = createOrchestrator({ DRIP_ARRIVAL_AB_ENABLED: 'true' });
        morningActive = true;

        // when
        await orchestrator.notifyTodayArrivals(
          AT_0800,
          DripGroup.ASIA,
          DripArrivalSlot.H0800,
        );

        // then
        expect(notifiedUsers()).toEqual([[[USER_B], 'b']]);
        expect(
          dripArrivalNotificationService.notify.mock.invocationCallOrder[0],
        ).toBeLessThan(morningPushService.run.mock.invocationCallOrder[0]);
      });

      it('스위치가 꺼져 있으면 08:00 크론은 (A/B 도 꺼져 있을 때) 실행 기록조차 읽지 않는다', async () => {
        // given
        orchestrator = createOrchestrator({});

        // when
        await orchestrator.notifyTodayArrivals(
          AT_0800,
          DripGroup.ASIA,
          DripArrivalSlot.H0800,
        );

        // then
        expect(
          dripBatchRunService.findByRunDateAndGroup,
        ).not.toHaveBeenCalled();
        expect(morningPushService.run).not.toHaveBeenCalled();
      });

      it('배치가 08:00 뒤에 끝나면 08:00 크론은 건너뛰고 배치가 끝나자마자 아침 알림을 부른다', async () => {
        // given
        orchestrator = createOrchestrator({});
        morningActive = true;
        dripBatchRunService.findByRunDateAndGroup.mockResolvedValue({
          ...run,
          finishedAt: new Date(AT_0800.getTime() + 60_000),
        });

        // when — 크론
        await orchestrator.notifyTodayArrivals(
          AT_0800,
          DripGroup.ASIA,
          DripArrivalSlot.H0800,
        );
        // then
        expect(morningPushService.run).not.toHaveBeenCalled();

        // when — 배치 종료(08:01)
        jest
          .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
          .setSystemTime(new Date(AT_0800.getTime() + 60_000));
        await orchestrator.run(AT_0800);

        // then
        expect(morningPushService.run).toHaveBeenCalledTimes(1);
      });

      it('08:00 전에 끝난 배치는 아침 알림을 부르지 않는다 — 08:00 크론 몫이다', async () => {
        // given
        orchestrator = createOrchestrator({});
        morningActive = true;
        jest
          .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
          .setSystemTime(AT_0500);

        // when
        await orchestrator.run(AT_0500);

        // then
        expect(morningPushService.run).not.toHaveBeenCalled();
      });

      it('아침 알림이 실패해도 던지지 않는다', async () => {
        // given
        orchestrator = createOrchestrator({});
        morningActive = true;
        morningPushService.run.mockRejectedValue(new Error('db down'));

        // when / then
        await expect(
          orchestrator.notifyTodayArrivals(
            AT_0800,
            DripGroup.ASIA,
            DripArrivalSlot.H0800,
          ),
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('시간대 그룹(global-api 2.4, KAN-191)', () => {
    /** 2026-08-27 05:00 BST(London) = 13:00 KST — europe 그룹 배치 시각 */
    const LONDON_0500 = new Date('2026-08-27T04:00:00.000Z');
    /** 2026-08-27 07:00 BST = 15:00 KST */
    const LONDON_0700 = new Date('2026-08-27T06:00:00.000Z');
    const KR_USER = buildUser('kr');
    const LONDON_USER = {
      ...buildUser('london'),
      market: UserMarket.GLOBAL,
      timezone: 'Europe/London',
    } as User;

    beforeEach(() => {
      userService.findDripTargetsPage
        .mockReset()
        .mockResolvedValueOnce([KR_USER, LONDON_USER])
        .mockResolvedValue([]);
    });

    const placedUserIds = () =>
      dripPlacementService.placeItems.mock.calls.map(([userId]) => userId);

    it('스위치가 꺼져 있으면 기본 그룹 크론만 돈다', () => {
      // when / then — 기본 orchestrator 는 스위치가 꺼져 있다
      expect(orchestrator.isGroupActive(DripGroup.ASIA)).toBe(true);
      expect(orchestrator.isGroupActive(DripGroup.EUROPE)).toBe(false);
      expect(orchestrator.isGroupActive(DripGroup.AMERICAS)).toBe(false);
    });

    it('스위치가 꺼져 있으면 GLOBAL 사용자도 05:00 KST 배치에서 편성된다(종전 그대로)', async () => {
      // when
      await orchestrator.run(NOW);

      // then
      expect(new Set(placedUserIds())).toEqual(new Set(['kr', 'london']));
    });

    it('스위치가 켜져 있으면 기본 그룹 배치는 시간대가 다른 GLOBAL 사용자를 대상에서 뺀다', async () => {
      // given
      orchestrator = createOrchestrator({
        DRIP_TIMEZONE_GROUPS_ENABLED: 'true',
      });

      // when
      await orchestrator.run(NOW);

      // then
      expect(new Set(placedUserIds())).toEqual(new Set(['kr']));
      expect(dripBatchRunService.finish).toHaveBeenCalledWith(
        run,
        expect.objectContaining({ targetCount: 1 }),
        expect.any(Date),
      );
    });

    it('그룹 배치는 그 그룹 실행권을 집고 그 그룹 사용자만 편성한다 — 알림은 현지 07:00 전이라 보내지 않는다', async () => {
      // given
      orchestrator = createOrchestrator({
        DRIP_TIMEZONE_GROUPS_ENABLED: 'true',
      });

      // when
      await orchestrator.run(LONDON_0500, 'scheduled', DripGroup.EUROPE);

      // then
      expect(dripBatchRunService.claim).toHaveBeenCalledWith(
        '2026-08-27',
        DripGroup.EUROPE,
        LONDON_0500,
        { reclaimUnfinished: false },
      );
      expect(new Set(placedUserIds())).toEqual(new Set(['london']));
      expect(dripArrivalNotificationService.notify).not.toHaveBeenCalled();
    });

    it('그룹 알림의 보관 시한은 그 그룹의 다음 배치다 — 다음 05:00 KST 가 아니다', async () => {
      // given
      libraryService.findPlacementsAddedBetween.mockResolvedValue([
        {
          userId: 'u1',
          contentId: 'r1',
          source: LibraryItemSource.DRIP,
          content: { title: 't' },
        } as never,
      ]);

      dripBatchRunService.findByRunDateAndGroup.mockResolvedValue({
        ...run,
        group: DripGroup.EUROPE,
        // 런던 05:00:10(BST)에 끝난 실행
        finishedAt: new Date('2026-08-27T04:00:10.000Z'),
      });

      // when — 런던 07:00(BST)
      await orchestrator.notifyTodayArrivals(LONDON_0700, DripGroup.EUROPE);

      // then — 다음 날 런던 05:00(BST) = 04:00 UTC
      const [, , nextBatchAt] =
        dripArrivalNotificationService.notify.mock.calls[0];
      expect(nextBatchAt.toISOString()).toBe('2026-08-28T04:00:00.000Z');
    });

    it('그룹 알림은 그 그룹 실행 기록을 찾는다', async () => {
      // when
      await orchestrator.notifyTodayArrivals(LONDON_0700, DripGroup.EUROPE);

      // then
      expect(dripBatchRunService.findByRunDateAndGroup).toHaveBeenCalledWith(
        '2026-08-27',
        DripGroup.EUROPE,
      );
    });

    it('현지 07:00 이 지나 끝난 그룹 배치는 끝나자마자 그 그룹 알림을 보낸다', async () => {
      // given — 끝난 시각은 실제 시계로 판정하므로 런던 07:00 에 고정한다
      jest
        .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
        .setSystemTime(LONDON_0700);
      orchestrator = createOrchestrator({
        DRIP_TIMEZONE_GROUPS_ENABLED: 'true',
      });
      libraryService.findPlacementsAddedBetween.mockResolvedValue([
        {
          userId: 'london',
          contentId: 'r1',
          source: LibraryItemSource.DRIP,
          content: { title: 't' },
        } as never,
      ]);

      try {
        // when
        await orchestrator.run(LONDON_0700, 'resume', DripGroup.EUROPE);

        // then — 다음 날 런던 05:00(BST) 까지 보관
        expect(dripArrivalNotificationService.notify).toHaveBeenCalledTimes(1);
        const [, , nextBatchAt] =
          dripArrivalNotificationService.notify.mock.calls[0];
        expect(nextBatchAt.toISOString()).toBe('2026-08-28T04:00:00.000Z');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
