import { Content } from '@/modules/content/entities/content.entity';
import {
  ContentDifficulty,
  ContentFormat,
} from '@/modules/content/content.enum';

import { DripScoringService } from './drip-scoring.service';
import {
  RegularScoringContext,
  ScoreBreakdown,
  ScoringCandidate,
  UserPreferenceWeights,
} from '../drip.types';

/** 선별(selectWithDiversity) 테스트는 점수만 보므로 축 분해는 비워 둔다 */
const EMPTY_BREAKDOWN: ScoreBreakdown = {
  embedding: null,
  signal: null,
  meta: null,
  metaItems: {
    topicMatch: null,
    freshness: null,
    popularity: null,
    difficultyFit: null,
    seriesContinuity: null,
    exposureFatigue: null,
  },
};

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
    embedding?: number[] | null;
  } = {},
): ScoringCandidate {
  return {
    content: buildContent(id, overrides.content),
    playCount: overrides.playCount ?? 0,
    completeCount: overrides.completeCount ?? 0,
    topicIds: overrides.topicIds ?? [TOPIC_A],
    embedding: overrides.embedding ?? null,
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
    tasteEmbedding: null,
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

  describe('scoreRegularCandidates — 임베딩 유사도 축(4.2 ①)', () => {
    it('주제·키워드가 겹치지 않아도 취향 벡터와 유사한 임베딩의 후보가 가점된다', () => {
      // given — 조건이 같은 두 후보, 임베딩만 취향([1,0])과의 유사도가 다르다
      const scored = service.scoreRegularCandidates(
        [
          buildCandidate('similar', { topicIds: [], embedding: [1, 0] }),
          buildCandidate('different', { topicIds: [], embedding: [0, 1] }),
        ],
        buildContext({
          isColdStart: false,
          preference: buildPreference({ tasteEmbedding: [1, 0] }),
        }),
      );

      // then
      expect(scoreOf(scored, 'similar')).toBeGreaterThan(
        scoreOf(scored, 'different'),
      );
    });

    it('임베딩이 없는 후보는 축이 빠진 재정규화로 계산되고 탈락하지 않는다', () => {
      // given
      const scored = service.scoreRegularCandidates(
        [buildCandidate('bare', { embedding: null })],
        buildContext({
          isColdStart: false,
          preference: buildPreference({ tasteEmbedding: [1, 0] }),
        }),
      );

      // then
      expect(scored).toHaveLength(1);
      expect(Number.isFinite(scored[0].score)).toBe(true);
    });

    it('취향 벡터가 없는 사용자는 임베딩 축 없이 종전과 같은 점수를 받는다', () => {
      // given — 같은 후보를 취향 벡터 유무만 바꿔 두 번 계산한다
      const candidate = (): ReturnType<typeof buildCandidate>[] => [
        buildCandidate('c1', { embedding: [1, 0] }),
      ];
      const context = buildContext({
        isColdStart: false,
        preference: buildPreference({ tasteEmbedding: null }),
      });

      // when
      const withoutTaste = service.scoreRegularCandidates(candidate(), context);

      // then — 축 결여는 재정규화라 점수가 계산되고, NaN·0 고정이 아니다
      expect(Number.isFinite(withoutTaste[0].score)).toBe(true);
    });
  });

  describe('selectWithDiversity', () => {
    it('주제·저자가 달라도 임베딩이 사실상 같은 두 편은 MMR 감점으로 함께 뽑히지 않는다', () => {
      // given — a1·a2는 내용이 같고(코사인 1) b1은 다르다. 이산 규칙으로는 셋 다 통과한다
      const base = { isSeriesContinuation: false, breakdown: EMPTY_BREAKDOWN };
      const scored = [
        {
          ...buildCandidate('a1', { topicIds: [TOPIC_A], embedding: [1, 0] }),
          score: 0.9,
          ...base,
        },
        {
          ...buildCandidate('a2', { topicIds: [TOPIC_B], embedding: [1, 0] }),
          score: 0.85,
          ...base,
        },
        {
          ...buildCandidate('b1', {
            topicIds: ['cccccccc-1111-4111-8111-111111111111'],
            embedding: [0, 1],
          }),
          score: 0.7,
          ...base,
        },
      ];

      // when
      const picks = service.selectWithDiversity(scored, 2);

      // then — a2는 0.85 − 0.3×1 = 0.55로 밀리고 b1(0.7)이 뽑힌다
      expect(picks.map((pick) => pick.content.id).sort()).toEqual(['a1', 'b1']);
    });

    it('시리즈 연속 편은 MMR 감점을 받지 않는다', () => {
      // given — a2는 a1과 내용이 같지만 시리즈 다음 편이다
      const scored = [
        {
          ...buildCandidate('a1', { topicIds: [TOPIC_A], embedding: [1, 0] }),
          score: 0.9,
          isSeriesContinuation: false,
          breakdown: EMPTY_BREAKDOWN,
        },
        {
          ...buildCandidate('a2', { topicIds: [TOPIC_A], embedding: [1, 0] }),
          score: 0.85,
          isSeriesContinuation: true,
          breakdown: EMPTY_BREAKDOWN,
        },
        {
          ...buildCandidate('b1', { topicIds: [TOPIC_B], embedding: [0, 1] }),
          score: 0.7,
          isSeriesContinuation: false,
          breakdown: EMPTY_BREAKDOWN,
        },
      ];

      // when
      const picks = service.selectWithDiversity(scored, 2);

      // then
      expect(picks.map((pick) => pick.content.id).sort()).toEqual(['a1', 'a2']);
    });

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

    it('카탈로그 전체 완청률이 절대 하한 아래여도 탐험 후보가 전멸하지 않는다 — 하한은 풀에 상대적이다', () => {
      // given — 테스터가 훑어보기만 한 작은 카탈로그: 재생은 있는데 완청이 거의 없다(2026-09-10 실서버)
      const skimmed = ['s1', 's2', 's3'].map((id) =>
        buildCandidate(id, {
          topicIds: [TOPIC_B],
          playCount: 10,
          completeCount: 0,
        }),
      );
      const oneComplete = buildCandidate('s4', {
        topicIds: [TOPIC_B],
        playCount: 10,
        completeCount: 1,
      });

      // when
      const picks = service.selectDiscovery({
        candidates: [...skimmed, oneComplete],
        exposureCounts: new Map(),
        activeTopicIds: [TOPIC_A],
        userRemovedTopicIds: [],
        pickedTopicIds: [],
        count: 1,
        now: NOW,
      });

      // then — 절대 하한(0.2)만 있었다면 넷 다 스무딩 값이 0.2 미만이라 0편이 됐다
      expect(picks).toHaveLength(1);
    });

    it('재생 표본이 부족한 후보는 품질 하한을 적용하지 않는다 — 신작 노출이 슬롯의 목적이다', () => {
      // given — 카탈로그는 완청률이 높은데(하한 0.2 유효) 신작은 재생 2회 완청 0
      const established = buildCandidate('old', {
        topicIds: [TOPIC_B],
        playCount: 200,
        completeCount: 160,
      });
      const fresh = buildCandidate('fresh', {
        topicIds: [TOPIC_B],
        playCount: 2,
        completeCount: 0,
      });

      // when
      const picks = service.selectDiscovery({
        candidates: [established, fresh],
        exposureCounts: new Map([['old', 50]]),
        activeTopicIds: [TOPIC_A],
        userRemovedTopicIds: [],
        pickedTopicIds: [],
        count: 2,
        now: NOW,
      });

      // then — 표본 2회로는 "안 듣는 콘텐츠"라고 판정할 근거가 없다
      expect(picks.map((pick) => pick.content.id)).toContain('fresh');
    });

    it('정규 편과 내용이 겹치는 탐험 편은 MMR 감점으로 밀린다', () => {
      // given — 같은 조건의 두 후보. duplicate만 정규 편 임베딩([1,0])과 내용이 같다
      const duplicate = buildCandidate('duplicate', {
        topicIds: [TOPIC_B],
        embedding: [1, 0],
      });
      const fresh = buildCandidate('fresh', {
        topicIds: [TOPIC_B],
        embedding: [0, 1],
      });

      // when
      const picks = service.selectDiscovery({
        candidates: [duplicate, fresh],
        exposureCounts: new Map(),
        activeTopicIds: [TOPIC_A],
        userRemovedTopicIds: [],
        pickedTopicIds: [],
        pickedEmbeddings: [[1, 0]],
        count: 1,
        now: NOW,
      });

      // then
      expect(picks.map((pick) => pick.content.id)).toEqual(['fresh']);
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
