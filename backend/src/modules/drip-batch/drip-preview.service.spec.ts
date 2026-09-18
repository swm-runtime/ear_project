import { BusinessException } from '@/common/exceptions/business.exception';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { ScoreBreakdown } from '@/modules/drip/drip.types';
import { TopicService } from '@/modules/interest/services/topic.service';
import { UserInterestService } from '@/modules/interest/services/user-interest.service';
import { LibraryService } from '@/modules/library/library.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';
import { UserDripPlan } from './drip-batch.types';
import { DripPreviewService } from './drip-preview.service';

const NOW = new Date('2026-09-18T09:00:00.000Z'); // KST 18:00 → 서비스 날짜 2026-09-18
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';

const BREAKDOWN: ScoreBreakdown = {
  embedding: null,
  signal: 0.6,
  signalItems: {
    topicPreference: 0.7,
    authorPreference: null,
    keywordMatch: 0.5,
    formatPreference: null,
    durationCloseness: 0.6,
  },
  meta: 0.5,
  metaItems: {
    topicMatch: 0.6,
    freshness: 1,
    popularity: 0.5,
    difficultyFit: null,
    careerFit: null,
    seriesContinuity: null,
    exposureFatigue: 1,
  },
};

function buildContent(id: string, title: string): Content {
  return {
    id,
    title,
    authorName: null,
    sourceName: '출처',
    seriesId: null,
    episodeNo: null,
    durationSec: 600,
    difficulty: null,
    format: null,
    isEvergreen: null,
    publishedAt: NOW,
    audioPath: 'audio/secret.mp3',
  } as Content;
}

function buildPlan(): UserDripPlan {
  const r1 = {
    content: buildContent('r1', '정규 1'),
    playCount: 10,
    completeCount: 5,
    topicIds: [TOPIC_A],
    embedding: null,
    score: 0.8,
    isSeriesContinuation: false,
    breakdown: BREAKDOWN,
  };
  const r2 = { ...r1, content: buildContent('r2', '정규 2'), score: 0.7 };
  const d1 = {
    ...r1,
    content: buildContent('d1', '탐험 1'),
    topicIds: [TOPIC_B],
    score: 0.9,
  };

  return {
    userId: USER_ID,
    activeTopicIds: [TOPIC_A],
    skipReason: 'unfinished_inventory',
    unfinishedCount: 6,
    dripCount: 2,
    discoveryCount: 1,
    signals: [{ contentId: 'r1', action: 'complete' as never, createdAt: NOW }],
    signalContentsById: new Map([['r1', r1.content]]),
    completeSignalCount: 4,
    isColdStart: false,
    preference: {
      topicWeights: { [TOPIC_A]: 1.5, [TOPIC_B]: -0.2 },
      authorWeights: {},
      keywordWeights: { ai: 0.8 },
      formatWeights: {},
      durationPref: { median_sec: 600, p25_sec: 500, p75_sec: 700 },
      tasteEmbedding: null,
      signalCount: 4,
    },
    difficultyAffinity: null,
    completedEpisodesBySeries: new Map(),
    regular: {
      poolSize: 2,
      gatedOut: [],
      recentDripTopicIds: [],
      scored: [r1, r2],
      picks: [r2, r1],
    },
    discovery: {
      poolSize: 1,
      exposureCounts: new Map([['d1', 3]]),
      userRemovedTopicIds: [],
      ranking: {
        qualityFloor: 0.2,
        typicalCompleteRate: 0.5,
        scored: [d1],
        excluded: [],
      },
      picks: [d1],
    },
    discoveryError: null,
  };
}

describe('DripPreviewService', () => {
  let service: DripPreviewService;
  let userService: jest.Mocked<UserService>;
  let orchestrator: jest.Mocked<DripBatchOrchestrator>;
  let contentService: jest.Mocked<ContentService>;

  beforeEach(() => {
    userService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: USER_ID,
        email: 'tester@example.com',
        nickname: '테스터',
        tier: UserTier.LIGHT,
        jobCategory: null,
        yearsOfExperience: null,
        onboardingCompleted: true,
      }),
    } as unknown as jest.Mocked<UserService>;

    const userInterestService = {
      findAllActive: jest
        .fn()
        .mockResolvedValue([{ topicId: TOPIC_A, source: 'onboarding' }]),
      findUserRemovedTopicIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserInterestService>;

    const topicService = {
      findAllByIds: jest.fn().mockImplementation((ids: string[]) =>
        Promise.resolve(
          ids
            .filter((id) => id === TOPIC_A || id === TOPIC_B)
            .map((id) => ({
              id,
              name: id === TOPIC_A ? '주제 A' : '주제 B',
            })),
        ),
      ),
    } as unknown as jest.Mocked<TopicService>;

    contentService = {
      findAllByIds: jest
        .fn()
        .mockResolvedValue([buildContent('placed', '오늘 적립된 편')]),
    } as unknown as jest.Mocked<ContentService>;

    const libraryService = {
      findRecentDripContentIds: jest.fn().mockResolvedValue(['placed']),
    } as unknown as jest.Mocked<LibraryService>;

    orchestrator = {
      planForUser: jest.fn().mockResolvedValue(buildPlan()),
    } as unknown as jest.Mocked<DripBatchOrchestrator>;

    service = new DripPreviewService(
      userService,
      userInterestService,
      topicService,
      contentService,
      libraryService,
      orchestrator,
    );
  });

  it('계산만 하는 옵션으로 오케스트레이터를 부른다 — 취향 캐시 저장 없음, 스킵에서 멈추지 않음', async () => {
    await service.preview('tester@example.com', NOW);

    expect(orchestrator.planForUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      NOW,
      expect.any(Map),
      { persistPreference: false, stopAtSkip: false },
    );
  });

  it('최종 편성분에 순서를 붙이고, 주제·신호 콘텐츠에 이름을 붙인다', async () => {
    const view = await service.preview('tester@example.com', NOW);

    expect(view.serviceDate).toBe('2026-09-18');
    expect(view.skipReason).toBe('unfinished_inventory');
    expect(
      view.regular?.candidates.map((c) => [c.contentId, c.pickOrder]),
    ).toEqual([
      ['r1', 2],
      ['r2', 1],
    ]);
    expect(view.discovery?.candidates[0]).toEqual(
      expect.objectContaining({
        contentId: 'd1',
        pickOrder: 1,
        exposureCount: 3,
        isOutsideInterests: true,
        topics: [{ topicId: TOPIC_B, name: '주제 B' }],
      }),
    );
    expect(view.interests).toEqual([
      { topicId: TOPIC_A, name: '주제 A', source: 'onboarding' },
    ]);
    expect(view.preference.topicWeights[0]).toEqual({
      key: TOPIC_A,
      name: '주제 A',
      weight: 1.5,
    });
    expect(view.signals[0].title).toBe('정규 1');
    expect(view.todayPlaced).toEqual([
      { contentId: 'placed', title: '오늘 적립된 편' },
    ]);
  });

  it('응답에 오디오 경로를 싣지 않는다', async () => {
    const view = await service.preview('tester@example.com', NOW);

    expect(JSON.stringify(view)).not.toContain('audio/secret.mp3');
  });

  it('이메일에 해당하는 사용자가 없으면 NOT_FOUND', async () => {
    userService.findByEmail.mockResolvedValue(null);

    await expect(
      service.preview('nobody@example.com', NOW),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(orchestrator.planForUser).not.toHaveBeenCalled();
  });
});
