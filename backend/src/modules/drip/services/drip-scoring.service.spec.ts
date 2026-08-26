import { Content } from '@/modules/content/entities/content.entity';
import {
  ContentDifficulty,
  ContentFormat,
} from '@/modules/content/content.enum';

import { DripScoringService } from './drip-scoring.service';
import {
  RegularScoringContext,
  ScoringCandidate,
  UserPreferenceWeights,
} from '../drip.types';

const NOW = new Date('2026-08-27T05:00:00.000Z');
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_B = 'bbbbbbbb-1111-4111-8111-111111111111';

function buildContent(id: string, overrides: Partial<Content> = {}): Content {
  return {
    id,
    title: `content-${id}`,
    authorName: null,
    seriesId: null,
    episodeNo: null,
    durationSec: 600,
    difficulty: null,
    format: null,
    isEvergreen: null,
    keywords: null,
    publishedAt: NOW,
    ...overrides,
  } as Content;
}

function buildCandidate(
  id: string,
  overrides: {
    playCount?: number;
    completeCount?: number;
    topicIds?: string[];
    content?: Partial<Content>;
  } = {},
): ScoringCandidate {
  return {
    content: buildContent(id, overrides.content),
    playCount: overrides.playCount ?? 0,
    completeCount: overrides.completeCount ?? 0,
    topicIds: overrides.topicIds ?? [TOPIC_A],
  };
}

function buildContext(
  overrides: Partial<RegularScoringContext> = {},
): RegularScoringContext {
  return {
    activeTopicIds: [TOPIC_A],
    preference: null,
    difficultyAffinity: null,
    completedEpisodesBySeries: new Map(),
    recentDripTopicIds: [],
    isColdStart: true,
    now: NOW,
    ...overrides,
  };
}

function buildPreference(
  overrides: Partial<UserPreferenceWeights> = {},
): UserPreferenceWeights {
  return {
    topicWeights: {},
    authorWeights: {},
    keywordWeights: {},
    formatWeights: {},
    durationPref: null,
    signalCount: 10,
    ...overrides,
  };
}

function scoreOf(
  scored: ReturnType<DripScoringService['scoreRegularCandidates']>,
  id: string,
): number {
  const found = scored.find((candidate) => candidate.content.id === id);

  if (!found) {
    throw new Error(`candidate not scored: ${id}`);
  }

  return found.score;
}

describe('DripScoringService', () => {
  let service: DripScoringService;

  beforeEach(() => {
    service = new DripScoringService();
  });

  describe('filterEpisodeOrder', () => {
    it('단일 콘텐츠와 시리즈 1편은 통과하고, 직전 편을 완청하지 않은 중간 편은 제외한다', () => {
      const single = buildCandidate('single');
      const first = buildCandidate('first', {
        content: { seriesId: 's1', episodeNo: 1 },
      });
      const middle = buildCandidate('middle', {
        content: { seriesId: 's1', episodeNo: 3 },
      });

      const result = service.filterEpisodeOrder(
        [single, first, middle],
        new Map(),
      );

      expect(result.map((candidate) => candidate.content.id)).toEqual([
        'single',
        'first',
      ]);
    });

    it('직전 편을 완청한 시리즈의 다음 편은 통과한다', () => {
      const next = buildCandidate('next', {
        content: { seriesId: 's1', episodeNo: 2 },
      });

      const result = service.filterEpisodeOrder([next], new Map([['s1', 1]]));

      expect(result).toHaveLength(1);
    });
  });

  describe('scoreRegularCandidates', () => {
    it('재생 3회·완청 3회(100%)가 재생 1,000회·완청 850회(85%)를 이기지 못한다 — 베이지안 스무딩', () => {
      const tiny = buildCandidate('tiny', { playCount: 3, completeCount: 3 });
      const large = buildCandidate('large', {
        playCount: 1000,
        completeCount: 850,
      });

      const scored = service.scoreRegularCandidates(
        [tiny, large],
        buildContext(),
      );

      expect(scoreOf(scored, 'large')).toBeGreaterThan(scoreOf(scored, 'tiny'));
    });

    it('추천 메타가 전부 NULL인 콘텐츠도 후보에서 탈락하지 않고 점수가 계산된다', () => {
      const bare = buildCandidate('bare');

      const scored = service.scoreRegularCandidates([bare], buildContext());

      expect(scored).toHaveLength(1);
      expect(scored[0].score).toBeGreaterThan(0);
    });

    it('발행 6개월이 지난 에버그린은 같은 조건의 시의성 콘텐츠보다 신선도 감점이 작다', () => {
      const publishedAt = new Date('2026-02-27T05:00:00.000Z');
      const evergreen = buildCandidate('evergreen', {
        content: { isEvergreen: true, publishedAt },
      });
      const timely = buildCandidate('timely', {
        content: { isEvergreen: false, publishedAt },
      });

      const scored = service.scoreRegularCandidates(
        [evergreen, timely],
        buildContext(),
      );

      expect(scoreOf(scored, 'evergreen')).toBeGreaterThan(
        scoreOf(scored, 'timely'),
      );
    });

    it('완청이 잦은 형식(format)에 가점한다', () => {
      const preference = buildPreference({
        formatWeights: { [ContentFormat.HOWTO]: 2 },
      });
      const howto = buildCandidate('howto', {
        content: { format: ContentFormat.HOWTO },
      });
      const opinion = buildCandidate('opinion', {
        content: { format: ContentFormat.OPINION },
      });

      const scored = service.scoreRegularCandidates(
        [howto, opinion],
        buildContext({ isColdStart: false, preference }),
      );

      expect(scoreOf(scored, 'howto')).toBeGreaterThan(
        scoreOf(scored, 'opinion'),
      );
    });

    it('취향 키워드와 겹치는 후보에 가점한다', () => {
      const preference = buildPreference({
        keywordWeights: { 'ISA 계좌': 2 },
      });
      const matched = buildCandidate('matched', {
        content: { keywords: ['ISA 계좌'] },
      });
      const unmatched = buildCandidate('unmatched', {
        content: { keywords: ['복리 계산'] },
      });

      const scored = service.scoreRegularCandidates(
        [matched, unmatched],
        buildContext({ isColdStart: false, preference }),
      );

      expect(scoreOf(scored, 'matched')).toBeGreaterThan(
        scoreOf(scored, 'unmatched'),
      );
    });

    it('부정 신호가 쌓인 주제의 후보는 감점된다', () => {
      const preference = buildPreference({
        topicWeights: { [TOPIC_A]: -2, [TOPIC_B]: 2 },
      });
      const disliked = buildCandidate('disliked', { topicIds: [TOPIC_A] });
      const liked = buildCandidate('liked', { topicIds: [TOPIC_B] });

      const scored = service.scoreRegularCandidates(
        [disliked, liked],
        buildContext({
          activeTopicIds: [TOPIC_A, TOPIC_B],
          isColdStart: false,
          preference,
        }),
      );

      expect(scoreOf(scored, 'liked')).toBeGreaterThan(
        scoreOf(scored, 'disliked'),
      );
    });

    it('콜드스타트에서는 같은 조건의 beginner 난이도가 advanced보다 우선된다', () => {
      const beginner = buildCandidate('beginner', {
        content: { difficulty: ContentDifficulty.BEGINNER },
      });
      const advanced = buildCandidate('advanced', {
        content: { difficulty: ContentDifficulty.ADVANCED },
      });

      const scored = service.scoreRegularCandidates(
        [beginner, advanced],
        buildContext({ isColdStart: true }),
      );

      expect(scoreOf(scored, 'beginner')).toBeGreaterThan(
        scoreOf(scored, 'advanced'),
      );
    });

    it('완청한 시리즈의 다음 편에 강한 가점이 붙는다', () => {
      const continuation = buildCandidate('continuation', {
        content: { seriesId: 's1', episodeNo: 2 },
      });
      const plain = buildCandidate('plain');

      const scored = service.scoreRegularCandidates(
        [continuation, plain],
        buildContext({ completedEpisodesBySeries: new Map([['s1', 1]]) }),
      );

      expect(scoreOf(scored, 'continuation')).toBeGreaterThan(
        scoreOf(scored, 'plain'),
      );
    });

    it('최근 편성에서 반복된 주제는 감점된다', () => {
      const repeated = buildCandidate('repeated', { topicIds: [TOPIC_A] });
      const fresh = buildCandidate('fresh', { topicIds: [TOPIC_B] });

      const scored = service.scoreRegularCandidates(
        [repeated, fresh],
        buildContext({
          activeTopicIds: [TOPIC_A, TOPIC_B],
          recentDripTopicIds: [TOPIC_A],
        }),
      );

      expect(scoreOf(scored, 'fresh')).toBeGreaterThan(
        scoreOf(scored, 'repeated'),
      );
    });
  });

  describe('selectWithDiversity', () => {
    it('2편을 뽑을 때 같은 주제만 나오지 않게 다른 주제의 후보를 우선한다', () => {
      const scored = service.scoreRegularCandidates(
        [
          buildCandidate('a1', {
            topicIds: [TOPIC_A],
            playCount: 100,
            completeCount: 90,
          }),
          buildCandidate('a2', {
            topicIds: [TOPIC_A],
            playCount: 90,
            completeCount: 80,
          }),
          buildCandidate('b1', {
            topicIds: [TOPIC_B],
            playCount: 10,
            completeCount: 5,
          }),
        ],
        buildContext({ activeTopicIds: [TOPIC_A, TOPIC_B] }),
      );

      const picks = service.selectWithDiversity(scored, 2);

      expect(picks.map((pick) => pick.content.id).sort()).toEqual(['a1', 'b1']);
    });

    it('시리즈 연속 편은 같은 주제여도 다양성 예외로 뽑힌다', () => {
      const scored = service.scoreRegularCandidates(
        [
          buildCandidate('a1', {
            topicIds: [TOPIC_A],
            playCount: 100,
            completeCount: 90,
          }),
          buildCandidate('a2', {
            topicIds: [TOPIC_A],
            content: { seriesId: 's1', episodeNo: 2 },
          }),
          buildCandidate('b1', { topicIds: [TOPIC_B] }),
        ],
        buildContext({
          activeTopicIds: [TOPIC_A, TOPIC_B],
          completedEpisodesBySeries: new Map([['s1', 1]]),
        }),
      );

      const picks = service.selectWithDiversity(scored, 2);

      expect(picks.map((pick) => pick.content.id)).toContain('a2');
    });

    it('겹치지 않는 후보가 없으면 최고점 후보로 편수를 채운다', () => {
      const scored = service.scoreRegularCandidates(
        [
          buildCandidate('a1', {
            topicIds: [TOPIC_A],
            playCount: 100,
            completeCount: 90,
          }),
          buildCandidate('a2', {
            topicIds: [TOPIC_A],
            playCount: 50,
            completeCount: 40,
          }),
        ],
        buildContext(),
      );

      const picks = service.selectWithDiversity(scored, 2);

      expect(picks).toHaveLength(2);
    });
  });

  describe('selectDiscovery', () => {
    it('관심 주제 밖 후보를 관심 안 후보보다 우선한다', () => {
      const inside = buildCandidate('inside', { topicIds: [TOPIC_A] });
      const outside = buildCandidate('outside', { topicIds: [TOPIC_B] });

      const picks = service.selectDiscovery({
        candidates: [inside, outside],
        exposureCounts: new Map(),
        activeTopicIds: [TOPIC_A],
        userRemovedTopicIds: [],
        pickedTopicIds: [],
        count: 1,
        now: NOW,
      });

      expect(picks.map((pick) => pick.content.id)).toEqual(['outside']);
    });

    it('직접 해제한 주제의 콘텐츠는 후보에서 제외한다', () => {
      const removed = buildCandidate('removed', { topicIds: [TOPIC_B] });

      const picks = service.selectDiscovery({
        candidates: [removed],
        exposureCounts: new Map(),
        activeTopicIds: [TOPIC_A],
        userRemovedTopicIds: [TOPIC_B],
        pickedTopicIds: [],
        count: 1,
        now: NOW,
      });

      expect(picks).toHaveLength(0);
    });

    it('스무딩 완청률이 품질 하한 미만인 콘텐츠는 제외한다', () => {
      const poor = buildCandidate('poor', {
        topicIds: [TOPIC_B],
        playCount: 1000,
        completeCount: 50,
      });
      const good = buildCandidate('good', {
        topicIds: [TOPIC_B],
        playCount: 100,
        completeCount: 60,
      });

      const picks = service.selectDiscovery({
        candidates: [poor, good],
        exposureCounts: new Map(),
        activeTopicIds: [TOPIC_A],
        userRemovedTopicIds: [],
        pickedTopicIds: [],
        count: 2,
        now: NOW,
      });

      expect(picks.map((pick) => pick.content.id)).toEqual(['good']);
    });

    it('전 사용자 편성 이력이 적은(저노출) 후보를 우선한다', () => {
      const exposed = buildCandidate('exposed', { topicIds: [TOPIC_B] });
      const unexposed = buildCandidate('unexposed', { topicIds: [TOPIC_B] });

      const picks = service.selectDiscovery({
        candidates: [exposed, unexposed],
        exposureCounts: new Map([['exposed', 10]]),
        activeTopicIds: [TOPIC_A],
        userRemovedTopicIds: [],
        pickedTopicIds: [],
        count: 1,
        now: NOW,
      });

      expect(picks.map((pick) => pick.content.id)).toEqual(['unexposed']);
    });
  });
});
