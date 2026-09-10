import { Content } from '@/modules/content/entities/content.entity';

import { rankByTopicWeights } from './explore.ranking';

const CAREER_TOPIC = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCTIVITY_TOPIC = 'bbbbbbbb-1111-4111-8111-111111111111';

function buildContent(id: string): Content {
  return { id } as Content;
}

describe('exploreRanking', () => {
  describe('rankByTopicWeights', () => {
    it('가중치가 높은 주제의 콘텐츠를 앞으로 올린다', () => {
      // given — 인기·신선도 순으로는 content-1이 앞이지만 취향은 생산성 주제를 가리킨다
      const contents = [buildContent('content-1'), buildContent('content-2')];
      const topicIds = new Map([
        ['content-1', [CAREER_TOPIC]],
        ['content-2', [PRODUCTIVITY_TOPIC]],
      ]);

      // when
      const ranked = rankByTopicWeights(contents, topicIds, {
        [PRODUCTIVITY_TOPIC]: 2.4,
      });

      // then
      expect(ranked.map((content) => content.id)).toEqual([
        'content-2',
        'content-1',
      ]);
    });

    it('음수 가중치 주제의 콘텐츠를 뒤로 내린다', () => {
      // given — 캐시의 주제 가중치는 담기 해제·삭제로 음수가 될 수 있다(4.3 해석 표)
      const contents = [buildContent('content-1'), buildContent('content-2')];
      const topicIds = new Map([
        ['content-1', [CAREER_TOPIC]],
        ['content-2', [PRODUCTIVITY_TOPIC]],
      ]);

      // when
      const ranked = rankByTopicWeights(contents, topicIds, {
        [CAREER_TOPIC]: -1.2,
      });

      // then
      expect(ranked.map((content) => content.id)).toEqual([
        'content-2',
        'content-1',
      ]);
    });

    it('여러 주제를 가진 콘텐츠는 주제 가중치를 더한다', () => {
      // given — 주제 수로 나누지 않는다(태깅 방식이 취향을 왜곡하면 안 된다)
      const contents = [buildContent('content-1'), buildContent('content-2')];
      const topicIds = new Map([
        ['content-1', [CAREER_TOPIC]],
        ['content-2', [CAREER_TOPIC, PRODUCTIVITY_TOPIC]],
      ]);

      // when
      const ranked = rankByTopicWeights(contents, topicIds, {
        [CAREER_TOPIC]: 1,
        [PRODUCTIVITY_TOPIC]: 0.5,
      });

      // then
      expect(ranked.map((content) => content.id)).toEqual([
        'content-2',
        'content-1',
      ]);
    });

    it('가중치가 없으면 들어온 순서를 그대로 유지한다', () => {
      // given — 후보는 이미 인기·신선도 순이다. 취향이 없는 사용자에게 순서를 흔들지 않는다
      const contents = [buildContent('content-1'), buildContent('content-2')];

      // when
      const ranked = rankByTopicWeights(contents, new Map(), {});

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

      // when
      const ranked = rankByTopicWeights(contents, topicIds, {
        [CAREER_TOPIC]: 3,
      });

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
      rankByTopicWeights(contents, topicIds, { [PRODUCTIVITY_TOPIC]: 5 });

      // then
      expect(contents.map((content) => content.id)).toEqual([
        'content-1',
        'content-2',
      ]);
    });
  });
});
