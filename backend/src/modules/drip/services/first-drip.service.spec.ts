import { ContentCohortService } from '@/modules/content/services/content-cohort.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { EnvironmentVariables } from '@/config/env.validation';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentStatService } from '@/modules/content/services/content-stat.service';
import { ContentService } from '@/modules/content/services/content.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { DripScoringService } from './drip-scoring.service';
import { FirstDripService } from './first-drip.service';
import { SCORING_POOL_LIMIT } from '../drip.constant';
import { DripExclusionReason, FirstDripJobStatus } from '../drip.enum';
import { FirstDripJob } from '../entities/first-drip-job.entity';
import { RandomSource } from '../first-drip-random.policy';
import { DripExcludedContentRepository } from '../repositories/drip-excluded-content.repository';
import { FirstDripJobRepository } from '../repositories/first-drip-job.repository';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_ID_2 = 'bbbbbbbb-1111-4111-8111-111111111111';

/** 시드 고정 난수(mulberry32) — 무작위 선정 테스트를 결정적으로 만든다 */
function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function configOf(
  env: Partial<EnvironmentVariables>,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: keyof EnvironmentVariables) => env[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

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

function buildContent(id: string, overrides: Partial<Content> = {}): Content {
  return {
    id,
    authorName: null,
    difficulty: null,
    isEvergreen: true,
    publishedAt: NOW,
    ...overrides,
  } as Content;
}

describe('FirstDripService', () => {
  let service: FirstDripService;
  let jobRepository: jest.Mocked<FirstDripJobRepository>;
  let excludedRepository: jest.Mocked<DripExcludedContentRepository>;
  let userService: jest.Mocked<UserService>;
  let planService: jest.Mocked<PlanService>;
  let userInterestService: jest.Mocked<UserInterestService>;
  let contentService: jest.Mocked<ContentService>;
  let contentStatService: jest.Mocked<ContentStatService>;
  let libraryService: jest.Mocked<LibraryService>;
  let dataSource: DataSource;
  let job: FirstDripJob;

  function buildService(
    env: Partial<EnvironmentVariables> = {},
    random?: RandomSource,
  ): FirstDripService {
    return new FirstDripService(
      jobRepository,
      excludedRepository,
      userService,
      planService,
      userInterestService,
      contentService,
      contentStatService,
      new DripScoringService(),
      libraryService,
      dataSource,
      configOf(env),
      new ContentCohortService(configOf(env)),
      random,
    );
  }

  beforeEach(() => {
    job = buildJob();

    jobRepository = {
      findByUserId: jest.fn().mockImplementation(() => Promise.resolve(job)),
      createIfAbsent: jest.fn(),
      updateExisting: jest.fn().mockResolvedValue(true),
      findByIdForUpdate: jest
        .fn()
        .mockImplementation(() => Promise.resolve(job)),
      claimRetryable: jest.fn(),
      deleteByUserId: jest.fn(),
    } as unknown as jest.Mocked<FirstDripJobRepository>;

    excludedRepository = {
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
      findTopicViews: jest.fn().mockResolvedValue([]),
      findScorableEmbeddings: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<ContentService>;

    contentStatService = {
      findAllTimeCounts: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<ContentStatService>;

    libraryService = {
      addItems: jest.fn().mockResolvedValue([]),
      countBySource: jest.fn(),
    } as unknown as jest.Mocked<LibraryService>;

    dataSource = {
      transaction: jest.fn((callback: (manager: unknown) => Promise<unknown>) =>
        callback({}),
      ),
    } as unknown as DataSource;

    service = buildService();
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

    it('편성 도중 시장 전환이 작업 행을 지웠으면 이전 시장 편을 적립하지 않고 행도 되살리지 않는다(global-api 4.11)', async () => {
      // given
      contentService.findCandidates.mockResolvedValue([
        buildContent('content-1'),
      ]);
      jobRepository.findByIdForUpdate.mockResolvedValue(null);

      // when
      await service.schedule(USER_ID, NOW);

      // then
      expect(libraryService.addItems).not.toHaveBeenCalled();
      expect(jobRepository.updateExisting).not.toHaveBeenCalled();
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

    it('재생 수 순서로 자르지 않고 콜드스타트 점수로 고른다 — 초급이 같은 인기의 고급보다 앞선다', async () => {
      // given — 후보 조회는 재생 수 순이다. 종전에는 앞 2편을 그대로 줬다
      contentService.findCandidates.mockResolvedValue([
        buildContent('advanced-1', {
          difficulty: 'advanced',
        } as Partial<Content>),
        buildContent('advanced-2', {
          difficulty: 'advanced',
        } as Partial<Content>),
        buildContent('beginner-1', {
          difficulty: 'beginner',
        } as Partial<Content>),
      ]);
      contentService.findTopicViews.mockResolvedValue(
        ['advanced-1', 'advanced-2', 'beginner-1'].map((contentId) => ({
          contentId,
          topicId: TOPIC_ID,
        })) as never,
      );

      // when
      await service.schedule(USER_ID, NOW);

      // then — 풀은 배치와 같은 크기로 받고, 초급 편이 뽑힌다(4.4)
      expect(contentService.findCandidates.mock.calls[0][0].limit).toBe(
        SCORING_POOL_LIMIT,
      );
      const [, picked] = libraryService.addItems.mock.calls[0];
      expect(picked).toHaveLength(2);
      expect(picked).toContain('beginner-1');
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

    it('이미 본 콘텐츠 제외를 애플리케이션 목록이 아니라 SQL에 맡긴다', async () => {
      // given
      contentService.findCandidates.mockResolvedValue([
        buildContent('content-3'),
        buildContent('content-4'),
      ]);

      // when
      await service.schedule(USER_ID, NOW);

      // then — 목록을 만들어 넘기지 않고 SQL이 판정하도록 사용자 id를 넘긴다.
      // 누적 이력은 계정 수명 동안 단조 증가해 NOT IN 바인딩으로는 감당되지 않는다
      const query = contentService.findCandidates.mock.calls[0][0];
      expect(query.excludeSeenByUserId).toBe(USER_ID);
      expect(query.excludeContentIds).toBeUndefined();
    });
  });

  describe('첫 드립 무작위 실험(KAN-291 — FIRST_DRIP_RANDOM_ENABLED)', () => {
    const POOL_IDS = Array.from({ length: 20 }, (_, i) => `content-${i + 1}`);
    const topicByIndex = (contentId: string) =>
      Number(contentId.split('-')[1]) <= 15 ? TOPIC_ID : TOPIC_ID_2;

    function givenPool(
      topicOf: (contentId: string) => string = () => TOPIC_ID,
    ): void {
      contentService.findCandidates.mockImplementation((query) =>
        Promise.resolve(
          query.includeTopicIds ? POOL_IDS.map((id) => buildContent(id)) : [],
        ),
      );
      contentService.findTopicViews.mockResolvedValue(
        POOL_IDS.map((contentId) => ({
          contentId,
          topicId: topicOf(contentId),
        })) as never,
      );
    }

    async function pickedWith(
      env: Partial<EnvironmentVariables>,
      random?: RandomSource,
    ): Promise<string[]> {
      job = buildJob();
      libraryService.addItems.mockClear();
      await buildService(env, random).schedule(USER_ID, NOW);
      return libraryService.addItems.mock.calls[0][1];
    }

    it('스위치가 꺼져 있으면 종전 경로 그대로다 — 스코어링으로 고르고 무작위 정렬을 요청하지 않는다', async () => {
      // given
      givenPool();

      // when
      const off = await pickedWith({ FIRST_DRIP_RANDOM_ENABLED: 'false' });
      const unset = await pickedWith({}, seededRandom(1));

      // then — 주입한 난수와 무관하게 스코어링 결과다
      for (const [query] of contentService.findCandidates.mock.calls) {
        expect(query.randomOrder).toBe(false);
      }
      expect(unset).toEqual(off);
      expect(contentStatService.findAllTimeCounts).toHaveBeenCalled();
    });

    it('"true"를 적었을 때만 켜진다 — 다른 값은 꺼짐이다', async () => {
      givenPool();

      await pickedWith({ FIRST_DRIP_RANDOM_ENABLED: 'yes' });
      expect(contentService.findCandidates.mock.calls[0][0].randomOrder).toBe(
        false,
      );

      contentService.findCandidates.mockClear();
      await pickedWith({ FIRST_DRIP_RANDOM_ENABLED: 'true' }, seededRandom(1));
      expect(contentService.findCandidates.mock.calls[0][0].randomOrder).toBe(
        true,
      );
    });

    it('켜면 같은 필터(시리즈 1편만·시장·본 것 제외)의 풀을 무작위로 잘라 받는다', async () => {
      // given
      givenPool();

      // when
      await pickedWith({ FIRST_DRIP_RANDOM_ENABLED: 'true' }, seededRandom(7));

      // then — 인기순 300 상한이 무작위 범위를 좁히지 않게 자르는 기준이 무작위다
      const query = contentService.findCandidates.mock.calls[0][0];
      expect(query).toMatchObject({
        includeTopicIds: [TOPIC_ID],
        excludeSeenByUserId: USER_ID,
        seriesStartOnly: true,
        randomOrder: true,
        limit: SCORING_POOL_LIMIT,
      });
      // 스코어링 입력(집계)은 읽지 않는다
      expect(contentStatService.findAllTimeCounts).not.toHaveBeenCalled();
    });

    it('같은 시드면 같은 편, 시드가 다르면 사람마다 다른 편이 나온다 — 풀 앞 2편에 고정되지 않는다', async () => {
      // given
      givenPool();
      const env = { FIRST_DRIP_RANDOM_ENABLED: 'true' };

      // when
      const first = await pickedWith(env, seededRandom(42));
      const again = await pickedWith(env, seededRandom(42));
      const others: string[] = [];
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        others.push((await pickedWith(env, seededRandom(seed))).join(','));
      }

      // then
      expect(first).toHaveLength(2);
      expect(again).toEqual(first);
      expect(new Set(others).size).toBeGreaterThan(1);
      expect(others.every((pair) => pair === 'content-1,content-2')).toBe(
        false,
      );
    });

    it('관심 주제가 여럿이면 주제를 돌아가며 뽑는다 — 한 주제에서 2편을 다 가져오지 않는다', async () => {
      // given — 앞 15편은 주제 1, 뒤 5편은 주제 2
      userInterestService.findActiveTopicIds.mockResolvedValue([
        TOPIC_ID,
        TOPIC_ID_2,
      ]);
      givenPool(topicByIndex);

      for (const seed of [1, 2, 3, 4, 5]) {
        // when
        const picked = await pickedWith(
          { FIRST_DRIP_RANDOM_ENABLED: 'true' },
          seededRandom(seed),
        );

        // then
        expect(new Set(picked.map(topicByIndex)).size).toBe(2);
      }
    });

    it('켜져 있어도 주제 안 후보가 모자라면 인기 대체 편성이 채운다', async () => {
      // given
      contentService.findCandidates
        .mockResolvedValueOnce([buildContent('content-1')])
        .mockResolvedValueOnce([buildContent('content-9')]);
      contentService.findTopicViews.mockResolvedValue([
        { contentId: 'content-1', topicId: TOPIC_ID },
      ] as never);

      // when
      const picked = await pickedWith(
        { FIRST_DRIP_RANDOM_ENABLED: 'true' },
        seededRandom(3),
      );

      // then — 대체 편성은 무작위가 아니라 종전 인기순 조회 그대로다(시리즈 1편만)
      expect(picked).toEqual(['content-1', 'content-9']);
      const fallbackQuery = contentService.findCandidates.mock.calls[1][0];
      expect(fallbackQuery).toMatchObject({
        excludeContentIds: ['content-1'],
        seriesStartOnly: true,
        limit: 1,
      });
      expect(fallbackQuery.randomOrder).toBeUndefined();
    });
  });

  describe('runWithRetries · runInBackground — 공통 재시도 규칙(common-error-handling 4.2)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // 지터를 없앤다 — 백오프가 정확히 1초 → 3초가 된다
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('최대 3회 시도한 뒤 queued 로 넘긴다 — 재시도 스케줄러가 이어받는다', async () => {
      contentService.findCandidates.mockRejectedValue(new Error('db down'));

      const running = service.runWithRetries(USER_ID, NOW);
      await jest.runAllTimersAsync();
      await running;

      expect(job.attemptCount).toBe(3);
      expect(job.status).toBe(FirstDripJobStatus.QUEUED);
      // 마지막 시도 시각 = 시작 + 1초 + 3초
      expect(job.lastAttemptedAt).toEqual(new Date(NOW.getTime() + 4000));
    });

    it('두 번째 시도에 성공하면 거기서 멈추고 completed 다', async () => {
      contentService.findCandidates
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue([buildContent('content-1')]);

      const running = service.runWithRetries(USER_ID, NOW);
      await jest.runAllTimersAsync();
      await running;

      expect(job.attemptCount).toBe(2);
      expect(job.status).toBe(FirstDripJobStatus.COMPLETED);
    });

    it('runInBackground 는 어떤 실패도 밖으로 던지지 않는다 — 이미 커밋된 온보딩 완료를 되돌리지 않는다', async () => {
      jobRepository.findByUserId.mockRejectedValue(new Error('db down'));

      const running = service.runInBackground(USER_ID, NOW);
      await jest.runAllTimersAsync();

      await expect(running).resolves.toBeUndefined();
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
