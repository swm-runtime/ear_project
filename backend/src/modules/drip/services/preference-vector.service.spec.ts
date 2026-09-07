import { Content } from '@/modules/content/entities/content.entity';
import { ContentFormat } from '@/modules/content/content.enum';

import { PreferenceVectorService } from './preference-vector.service';
import { PreferenceSignalAction } from '../drip.enum';
import { PreferenceSignalInput } from '../drip.types';
import { UserPreferenceVectorRepository } from '../repositories/user-preference-vector.repository';

const NOW = new Date('2026-08-27T05:00:00.000Z');
const TOPIC_A = 'aaaaaaaa-1111-4111-8111-111111111111';

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function buildContent(id: string, overrides: Partial<Content> = {}): Content {
  return {
    id,
    authorName: null,
    durationSec: 600,
    keywords: null,
    format: null,
    ...overrides,
  } as Content;
}

function buildSignal(
  contentId: string,
  action: PreferenceSignalAction,
  createdAt: Date = NOW,
): PreferenceSignalInput {
  return { contentId, action, createdAt };
}

describe('PreferenceVectorService', () => {
  let service: PreferenceVectorService;

  beforeEach(() => {
    // compute는 순수 계산이라 저장소를 쓰지 않는다
    service = new PreferenceVectorService(
      {} as unknown as UserPreferenceVectorRepository,
    );
  });

  describe('compute', () => {
    it('완청은 담기보다 큰 가중치로 주제에 쌓인다', () => {
      const content = buildContent('c1');
      const contentsById = new Map([['c1', content]]);
      const topicMap = new Map([['c1', [TOPIC_A]]]);

      const completed = service.compute(
        [buildSignal('c1', PreferenceSignalAction.COMPLETE)],
        contentsById,
        topicMap,
        1,
        NOW,
      );
      const saved = service.compute(
        [buildSignal('c1', PreferenceSignalAction.SAVE)],
        contentsById,
        topicMap,
        0,
        NOW,
      );

      expect(completed.topicWeights[TOPIC_A]).toBeGreaterThan(
        saved.topicWeights[TOPIC_A],
      );
    });

    it('오래된 신호일수록 최근성 감쇠로 영향이 감소한다', () => {
      const content = buildContent('c1');
      const contentsById = new Map([['c1', content]]);
      const topicMap = new Map([['c1', [TOPIC_A]]]);

      const recent = service.compute(
        [buildSignal('c1', PreferenceSignalAction.COMPLETE, NOW)],
        contentsById,
        topicMap,
        1,
        NOW,
      );
      const old = service.compute(
        [buildSignal('c1', PreferenceSignalAction.COMPLETE, daysAgo(28))],
        contentsById,
        topicMap,
        1,
        NOW,
      );

      expect(old.topicWeights[TOPIC_A]).toBeLessThan(
        recent.topicWeights[TOPIC_A],
      );
      expect(old.topicWeights[TOPIC_A]).toBeGreaterThan(0);
    });

    it('담기 해제·삭제는 음수 가중치로 쌓인다 — 부정 신호 회피의 근거다', () => {
      const content = buildContent('c1', { authorName: '김저자' });
      const contentsById = new Map([['c1', content]]);
      const topicMap = new Map([['c1', [TOPIC_A]]]);

      const weights = service.compute(
        [
          buildSignal('c1', PreferenceSignalAction.UNSAVE),
          buildSignal('c1', PreferenceSignalAction.DELETE),
        ],
        contentsById,
        topicMap,
        0,
        NOW,
      );

      expect(weights.topicWeights[TOPIC_A]).toBeLessThan(0);
      expect(weights.authorWeights['김저자']).toBeLessThan(0);
    });

    it('play 신호는 해석 표에 없으므로 가중치에 반영되지 않는다', () => {
      const content = buildContent('c1');
      const weights = service.compute(
        [buildSignal('c1', PreferenceSignalAction.PLAY)],
        new Map([['c1', content]]),
        new Map([['c1', [TOPIC_A]]]),
        0,
        NOW,
      );

      expect(weights.topicWeights[TOPIC_A]).toBeUndefined();
    });

    it('완청·재청취한 콘텐츠 길이로 duration_pref를 산출하고, 없으면 null이다', () => {
      const short = buildContent('short', { durationSec: 300 });
      const long = buildContent('long', { durationSec: 900 });
      const contentsById = new Map([
        ['short', short],
        ['long', long],
      ]);

      const withCompletes = service.compute(
        [
          buildSignal('short', PreferenceSignalAction.COMPLETE),
          buildSignal('long', PreferenceSignalAction.REPLAY),
        ],
        contentsById,
        new Map(),
        1,
        NOW,
      );
      const savesOnly = service.compute(
        [buildSignal('short', PreferenceSignalAction.SAVE)],
        contentsById,
        new Map(),
        0,
        NOW,
      );

      expect(withCompletes.durationPref).not.toBeNull();
      expect(withCompletes.durationPref?.p25_sec).toBe(300);
      expect(withCompletes.durationPref?.p75_sec).toBe(900);
      expect(savesOnly.durationPref).toBeNull();
    });

    it('추천 메타가 NULL인 콘텐츠는 키워드·형식 집계에서 제외된다', () => {
      const withMeta = buildContent('meta', {
        keywords: ['ISA 계좌'],
        format: ContentFormat.HOWTO,
      });
      const bare = buildContent('bare');

      const weights = service.compute(
        [
          buildSignal('meta', PreferenceSignalAction.COMPLETE),
          buildSignal('bare', PreferenceSignalAction.COMPLETE),
        ],
        new Map([
          ['meta', withMeta],
          ['bare', bare],
        ]),
        new Map(),
        2,
        NOW,
      );

      expect(Object.keys(weights.keywordWeights)).toEqual(['ISA 계좌']);
      expect(Object.keys(weights.formatWeights)).toEqual([ContentFormat.HOWTO]);
    });

    it('콜드스타트 판정용 signal_count는 전달된 완청 수를 그대로 담는다', () => {
      const weights = service.compute([], new Map(), new Map(), 2, NOW);

      expect(weights.signalCount).toBe(2);
    });
  });

  describe('compute — 취향 벡터(4.3-1)', () => {
    it('긍정 신호 콘텐츠의 임베딩을 최근성 가중으로 합해 단위 벡터로 정규화한다', () => {
      // given — 최근 완청 c1([1,0])과 14일(반감기) 전 완청 c2([0,1])
      const contentsById = new Map([
        ['c1', buildContent('c1')],
        ['c2', buildContent('c2')],
      ]);
      const embeddings = new Map([
        ['c1', [1, 0]],
        ['c2', [0, 1]],
      ]);

      // when
      const weights = service.compute(
        [
          buildSignal('c1', PreferenceSignalAction.COMPLETE, NOW),
          buildSignal('c2', PreferenceSignalAction.COMPLETE, daysAgo(14)),
        ],
        contentsById,
        new Map(),
        2,
        NOW,
        embeddings,
      );

      // then — 단위 벡터이고, 최근 신호의 성분이 더 크다(14일 = 반감기 1회)
      const taste = weights.tasteEmbedding;
      expect(taste).not.toBeNull();
      const norm = Math.sqrt(taste![0] ** 2 + taste![1] ** 2);
      expect(norm).toBeCloseTo(1);
      expect(taste![0]).toBeGreaterThan(taste![1]);
      expect(taste![1]).toBeGreaterThan(0);
    });

    it('부정 신호(unsave·delete)는 취향 벡터에 반영하지 않는다', () => {
      // given
      const contentsById = new Map([
        ['c1', buildContent('c1')],
        ['c2', buildContent('c2')],
      ]);
      const embeddings = new Map([
        ['c1', [1, 0]],
        ['c2', [0, 1]],
      ]);

      // when — c2는 담기 해제(부정)
      const weights = service.compute(
        [
          buildSignal('c1', PreferenceSignalAction.COMPLETE),
          buildSignal('c2', PreferenceSignalAction.UNSAVE),
        ],
        contentsById,
        new Map(),
        1,
        NOW,
        embeddings,
      );

      // then — c2의 성분이 더해지지도 빼지지도 않는다
      expect(weights.tasteEmbedding).toEqual([1, 0]);
    });

    it('긍정 신호 콘텐츠에 임베딩이 하나도 없으면 취향 벡터는 null이다', () => {
      // given — 완청은 있으나 임베딩 맵이 비어 있다
      const contentsById = new Map([['c1', buildContent('c1')]]);

      // when
      const weights = service.compute(
        [buildSignal('c1', PreferenceSignalAction.COMPLETE)],
        contentsById,
        new Map(),
        1,
        NOW,
        new Map(),
      );

      // then
      expect(weights.tasteEmbedding).toBeNull();
    });
  });
});
