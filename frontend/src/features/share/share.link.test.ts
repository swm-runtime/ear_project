import { describe, expect, it } from '@jest/globals';

import { buildShareLink, parseShareLink } from './share.link';

describe('share.link', () => {
  describe('buildShareLink', () => {
    it('콘텐츠 상세로 연결되는 링크 하나를 만든다 — content_id 외의 값을 싣지 않는다(share.md 4.2)', () => {
      expect(buildShareLink('content-7')).toBe('https://earcast.co.kr/contents/content-7');
    });
  });

  describe('parseShareLink', () => {
    it('우리 도메인의 /contents/:id 에서 content_id를 꺼낸다', () => {
      expect(parseShareLink('https://earcast.co.kr/contents/content-7')).toBe('content-7');
    });

    it('쿼리·해시·뒤따르는 경로가 붙어도 content_id만 꺼낸다', () => {
      expect(parseShareLink('https://earcast.co.kr/contents/content-7?utm=x')).toBe('content-7');
      expect(parseShareLink('https://earcast.co.kr/contents/content-7#top')).toBe('content-7');
      expect(parseShareLink('https://earcast.co.kr/contents/content-7/extra')).toBe('content-7');
    });

    it('다른 host는 공유 링크가 아니다', () => {
      expect(parseShareLink('https://evil.example.com/contents/content-7')).toBeNull();
      expect(parseShareLink('https://sub.earcast.co.kr/contents/content-7')).toBeNull();
    });

    it('다른 경로는 공유 링크가 아니다', () => {
      expect(parseShareLink('https://earcast.co.kr/about')).toBeNull();
      expect(parseShareLink('https://earcast.co.kr/contents/')).toBeNull();
    });

    it('http는 거른다 — 평문 링크를 공유 링크로 보지 않는다', () => {
      expect(parseShareLink('http://earcast.co.kr/contents/content-7')).toBeNull();
    });

    it('커스텀 스킴 ear://contents/:id 도 공유 링크다 — 인앱 브라우저 탈출 경로', () => {
      expect(parseShareLink('ear://contents/content-7')).toBe('content-7');
      expect(parseShareLink('ear://contents/content-7?utm=x')).toBe('content-7');
    });

    it('커스텀 스킴이라도 다른 경로는 거른다', () => {
      expect(parseShareLink('ear://about')).toBeNull();
      expect(parseShareLink('ear://contents/')).toBeNull();
      // 스킴만 흉내 낸 것도 통과시키지 않는다
      expect(parseShareLink('earcast://contents/content-7')).toBeNull();
      expect(parseShareLink('notear://contents/content-7')).toBeNull();
    });
  });
});
