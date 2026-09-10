import { describe, expect, it } from '@jest/globals';

import { buildShareMessage } from './share.service';

describe('share.service', () => {
  describe('buildShareMessage', () => {
    it('제목과 링크의 두 줄로 조립한다(확정 형식 A — share-uiux.md 6장)', () => {
      expect(
        buildShareMessage({
          contentId: 'content-7',
          title: '퇴사 전에 반드시 점검할 5가지',
        }),
      ).toBe('퇴사 전에 반드시 점검할 5가지\nhttps://earcast.co.kr/contents/content-7');
    });

    it('저자·출처를 싣지 않는다 — 링크를 열면 상세에서 보인다(2026-09-10 결정)', () => {
      const message = buildShareMessage({
        contentId: 'content-8',
        title: '이직 준비 로드맵',
      });
      // then — 종전 둘째 줄의 구분자(· )가 사라져 줄 수가 둘이다
      expect(message.split('\n')).toHaveLength(2);
      expect(message).not.toContain('·');
    });

    it('어떤 콘텐츠든 줄 수가 같다 — 저자 유무로 형식이 갈리지 않는다', () => {
      const withAuthor = buildShareMessage({ contentId: 'a', title: '면접 질문 30선' });
      const withoutAuthor = buildShareMessage({ contentId: 'b', title: '연봉 협상의 기술' });
      expect(withAuthor.split('\n')).toHaveLength(withoutAuthor.split('\n').length);
    });
  });
});
