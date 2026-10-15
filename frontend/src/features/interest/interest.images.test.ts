import { describe, expect, it } from '@jest/globals';

import { topicImageSource } from './interest.images';

/** jest 에서 이미지 require 는 파일 경로를 담은 객체로 풀린다 — 어떤 파일이 붙었는지 경로로 대조한다 */
const fileOf = (source: unknown): string => JSON.stringify(source);

/** BE KAN-212 확정 표(2026-10-15) — 이름 키와 slug 키가 같은 사진을 가리켜야 KR 칩이 1.2.0과 똑같이 보인다 */
const KR_SLUGS: [name: string, slug: string][] = [
  ['재테크', 'personal-finance'],
  ['경제 상식', 'economics-basics'],
  ['투자', 'investing'],
  ['부동산', 'real-estate'],
  ['경제', 'economy'],
  ['인문·교양', 'humanities'],
  ['철학', 'philosophy'],
  ['사회·문화', 'society-culture'],
  ['예술', 'art'],
  ['커뮤니케이션', 'communication'],
  ['산업안전', 'industrial-safety'],
  ['마케팅', 'marketing'],
  ['데이터·AI', 'data-ai'],
  ['IT·개발', 'it-dev'],
  ['자연과학', 'natural-science'],
  ['심리학', 'psychology'],
  ['뇌과학·인지', 'neuroscience'],
  ['습관·동기', 'habits-motivation'],
  ['인간관계', 'relationships'],
  ['글쓰기', 'writing'],
  ['커리어', 'career'],
  ['생산성', 'productivity'],
  ['리더십', 'leadership'],
  ['조직', 'organization'],
  ['디자인', 'design'],
  ['스타트업', 'startup'],
  ['트렌드', 'trends'],
  ['경영', 'management'],
  ['역사', 'history'],
  ['세계사', 'world-history'],
  ['한능검', 'korean-history-exam'],
  ['공인중개사', 'real-estate-agent-exam'],
  ['산업안전기사', 'industrial-safety-exam'],
  ['커리어 성장', 'career-growth'],
  ['이직·면접', 'job-change-interview'],
  ['AI·테크 트렌드', 'ai-tech-trends'],
];

const GLOBAL_SLUGS = [
  'korean-language',
  'k-food',
  'k-pop',
  'k-drama-film',
  'korean-culture',
  'k-beauty-fashion',
  'korean-history-society',
  'travel-in-korea',
];

const DEFAULT_IMAGE = fileOf(topicImageSource({}));

describe('topicImageSource', () => {
  it('기본 사진은 default.jpg 다', () => {
    // given / when / then
    expect(DEFAULT_IMAGE).toContain('default.jpg');
  });

  describe('slug 조회', () => {
    it.each(KR_SLUGS)('%s 의 slug(%s)는 같은 주제의 이름 키와 같은 사진을 붙인다', (name, slug) => {
      // given
      const byName = fileOf(topicImageSource({ name }));

      // when
      const bySlug = fileOf(topicImageSource({ slug }));

      // then
      expect(byName).not.toBe(DEFAULT_IMAGE);
      expect(bySlug).toBe(byName);
    });

    it('slug 와 이름이 함께 오면 slug 가 이긴다', () => {
      // given — 이름은 재테크, slug 는 커리어인 모순된 입력
      const input = { slug: 'career', name: '재테크' };

      // when
      const source = fileOf(topicImageSource(input));

      // then
      expect(source).toContain('topic-career.jpg');
    });

    it('영어 이름(GLOBAL)이어도 slug 가 표에 있으면 사진이 붙는다', () => {
      // given / when
      const source = fileOf(topicImageSource({ slug: 'productivity', name: 'Productivity' }));

      // then
      expect(source).toContain('topic-productivity.jpg');
    });
  });

  describe('재테크·투자 — 파일명과 slug 가 엇갈린다(KAN-212 ⚠️)', () => {
    it('재테크 slug(personal-finance)는 topic-investing.jpg 를 붙인다', () => {
      // given / when
      const source = fileOf(topicImageSource({ slug: 'personal-finance' }));

      // then
      expect(source).toContain('topic-investing.jpg');
    });

    it('투자 slug(investing)는 topic-invest.jpg 를 붙이고 재테크 사진을 붙이지 않는다', () => {
      // given / when
      const source = fileOf(topicImageSource({ slug: 'investing' }));

      // then
      expect(source).toContain('topic-invest.jpg');
      expect(source).not.toContain('topic-investing.jpg');
    });

    it('재테크와 투자는 slug 로 찾아도 서로 다른 사진이다', () => {
      // given / when
      const finance = fileOf(topicImageSource({ slug: 'personal-finance', name: '재테크' }));
      const investing = fileOf(topicImageSource({ slug: 'investing', name: '투자' }));

      // then
      expect(finance).not.toBe(investing);
    });
  });

  describe('이름 폴백', () => {
    it('slug 가 null 이면 이름 키로 찾는다(BE KAN-212 입력 전 KR 주제)', () => {
      // given / when
      const source = fileOf(topicImageSource({ slug: null, name: '투자' }));

      // then
      expect(source).toContain('topic-invest.jpg');
    });

    it('slug 가 표에 없으면 이름 키로 찾는다', () => {
      // given / when
      const source = fileOf(topicImageSource({ slug: 'unknown-new-slug', name: '심리학' }));

      // then
      expect(source).toContain('topic-psychology.jpg');
    });

    it('slug 가 없는 주제(TOPCIT)는 이름으로 찾는다', () => {
      // given / when
      const source = fileOf(topicImageSource({ name: 'TOPCIT' }));

      // then
      expect(source).toContain('topic-topcit.jpg');
    });
  });

  describe('기본 사진', () => {
    it('모르는 slug 와 모르는 이름이면 기본 사진이다', () => {
      // given / when
      const source = fileOf(topicImageSource({ slug: 'unknown-new-slug', name: '새 주제' }));

      // then
      expect(source).toBe(DEFAULT_IMAGE);
    });

    it.each(GLOBAL_SLUGS)('사진 자산이 아직 없는 GLOBAL slug(%s)는 기본 사진이다', (slug) => {
      // given / when
      const source = fileOf(topicImageSource({ slug, name: 'K-Pop' }));

      // then
      expect(source).toBe(DEFAULT_IMAGE);
    });

    it('프로토타입 키(constructor)를 slug·이름으로 받아도 기본 사진이다', () => {
      // given / when
      const source = fileOf(topicImageSource({ slug: 'constructor', name: 'toString' }));

      // then
      expect(source).toBe(DEFAULT_IMAGE);
    });
  });
});
