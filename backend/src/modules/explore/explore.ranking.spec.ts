import { Content } from '@/modules/content/entities/content.entity';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { UserSignalView } from '@/modules/playback/playback.types';

import { SIGNAL_RECENCY_WINDOW_DAYS } from './explore.constant';
import { rankByTopicWeights, toTopicWeights } from './explore.ranking';

const NOW = new Date('2026-08-05T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const CAREER_TOPIC = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCTIVITY_TOPIC = 'bbbbbbbb-1111-4111-8111-111111111111';

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function buildSignal(
  contentId: string,
  action: UserSignalAction,
  createdAt: Date = NOW,
): UserSignalView {
  return { contentId, action, createdAt };
}

function buildContent(id: string): Content {
  return { id } as Content;
}

describe('exploreRanking', () => {
  describe('toTopicWeights', () => {
    it('완청 신호는 그 콘텐츠의 주제 가중치를 올린다', () => {
      // given
      const topicIds = new Map([['content-1', [CAREER_TOPIC]]]);

      // when
      const weights = toTopicWeights(
        [buildSignal('content-1', UserSignalAction.COMPLETE)],
        topicIds,
        NOW,
      );

      // then
      expect(weights.get(CAREER_TOPIC)).toBeGreaterThan(0);
    });

    it('스킵 신호는 그 콘텐츠의 주제 가중치를 내린다', () => {
      // given
      const topicIds = new Map([['content-1', [CAREER_TOPIC]]]);

      // when
      const weights = toTopicWeights(
        [buildSignal('content-1', UserSignalAction.SKIP)],
        topicIds,
        NOW,
      );

      // then
      expect(weights.get(CAREER_TOPIC)).toBeLessThan(0);
    });

    it('재생 시작만으로는 가중치가 생기지 않는다', () => {
      // given — 신호 해석 표가 다루는 것은 "play 후 skip"이지 재생 시작 자체가 아니다
      const topicIds = new Map([['content-1', [CAREER_TOPIC]]]);

      // when
      const weights = toTopicWeights(
        [buildSignal('content-1', UserSignalAction.PLAY)],
        topicIds,
        NOW,
      );

      // then
      expect(weights.size).toBe(0);
    });

    it('오래된 신호일수록 영향이 작다', () => {
      // given — 최근성 가중(`drip-scheduling.md` 4.3)
      const topicIds = new Map([['content-1', [CAREER_TOPIC]]]);

      // when
      const fresh = toTopicWeights(
        [buildSignal('content-1', UserSignalAction.COMPLETE, daysAgo(1))],
        topicIds,
        NOW,
      );
      const stale = toTopicWeights(
        [
          buildSignal(
            'content-1',
            UserSignalAction.COMPLETE,
            daysAgo(SIGNAL_RECENCY_WINDOW_DAYS - 1),
          ),
        ],
        topicIds,
        NOW,
      );

      // then
      expect(fresh.get(CAREER_TOPIC)).toBeGreaterThan(
        stale.get(CAREER_TOPIC) ?? 0,
      );
    });

    it('창을 벗어난 신호는 반영하지 않는다', () => {
      // given
      const topicIds = new Map([['content-1', [CAREER_TOPIC]]]);

      // when
      const weights = toTopicWeights(
        [
          buildSignal(
            'content-1',
            UserSignalAction.COMPLETE,
            daysAgo(SIGNAL_RECENCY_WINDOW_DAYS + 1),
          ),
        ],
        topicIds,
        NOW,
      );

      // then
      expect(weights.size).toBe(0);
    });
  });

  describe('rankByTopicWeights', () => {
    it('가중치가 높은 주제의 콘텐츠를 앞으로 올린다', () => {
      // given — 인기·신선도 순으로는 content-1이 앞이지만 신호는 생산성 주제를 가리킨다
      const contents = [buildContent('content-1'), buildContent('content-2')];
      const topicIds = new Map([
        ['content-1', [CAREER_TOPIC]],
        ['content-2', [PRODUCTIVITY_TOPIC]],
        ['played', [PRODUCTIVITY_TOPIC]],
      ]);
      const weights = toTopicWeights(
        [buildSignal('played', UserSignalAction.COMPLETE)],
        topicIds,
        NOW,
      );

      // when
      const ranked = rankByTopicWeights(contents, topicIds, weights);

      // then
      expect(ranked.map((content) => content.id)).toEqual([
        'content-2',
        'content-1',
      ]);
    });

    it('신호가 없으면 들어온 순서를 그대로 유지한다', () => {
      // given — 후보는 이미 인기·신선도 순이다. 신호가 없는 사용자에게 순서를 흔들지 않는다
      const contents = [buildContent('content-1'), buildContent('content-2')];

      // when
      const ranked = rankByTopicWeights(contents, new Map(), new Map());

      // then
      expect(ranked.map((content) => content.id)).toEqual([
        'content-1',
        'content-2',
      ]);
    });

    it('점수가 같으면 들어온 순서를 tie-break로 쓴다', () => {
      // given — 같은 주제를 가진 두 콘텐츠
      const contents = [buildContent('content-1'), buildContent('content-2')];
      const topicIds = new Map([
        ['content-1', [CAREER_TOPIC]],
        ['content-2', [CAREER_TOPIC]],
      ]);
      const weights = new Map([[CAREER_TOPIC, 3]]);

      // when
      const ranked = rankByTopicWeights(contents, topicIds, weights);

      // then
      expect(ranked.map((content) => content.id)).toEqual([
        'content-1',
        'content-2',
      ]);
    });

    it('입력 배열을 바꾸지 않는다', () => {
      // given — 호출부가 같은 후보 목록을 다른 섹션에도 쓴다
      const contents = [buildContent('content-1'), buildContent('content-2')];
      const topicIds = new Map([
        ['content-1', [CAREER_TOPIC]],
        ['content-2', [PRODUCTIVITY_TOPIC]],
      ]);

      // when
      rankByTopicWeights(
        contents,
        topicIds,
        new Map([[PRODUCTIVITY_TOPIC, 5]]),
      );

      // then
      expect(contents.map((content) => content.id)).toEqual([
        'content-1',
        'content-2',
      ]);
    });
  });
});
