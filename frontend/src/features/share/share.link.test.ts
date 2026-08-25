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

    it('https가 아닌 스킴은 거른다', () => {
      expect(parseShareLink('http://earcast.co.kr/contents/content-7')).toBeNull();
    });
  });
});
