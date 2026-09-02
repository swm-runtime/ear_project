import { describe, expect, it } from '@jest/globals';

import { buildShareMessage } from './share.service';

describe('share.service', () => {
  describe('buildShareMessage', () => {
    it('제목·저자 · 출처·링크의 세 줄로 조립한다(share-uiux.md 6장 제안 형식)', () => {
      expect(
        buildShareMessage({
          contentId: 'content-7',
          title: '퇴사 전에 반드시 점검할 5가지',
          authorName: '김하나',
          sourceName: '폴인',
        }),
      ).toBe(
        '퇴사 전에 반드시 점검할 5가지\n김하나 · 폴인\nhttps://earcast.co.kr/contents/content-7',
      );
    });

    it('저자가 없으면 출처만 싣는다 — "저자 없음"으로 채우지 않는다(share.md 4.1)', () => {
      expect(
        buildShareMessage({
          contentId: 'content-8',
          title: '이직 준비 로드맵',
          authorName: null,
          sourceName: '이어',
        }),
      ).toBe('이직 준비 로드맵\n이어\nhttps://earcast.co.kr/contents/content-8');
    });

    it('저자가 빈 문자열이어도 출처만 싣는다', () => {
      expect(
        buildShareMessage({
          contentId: 'content-9',
          title: '면접 질문 30선',
          authorName: '',
          sourceName: '롱블랙',
        }),
      ).toBe('면접 질문 30선\n롱블랙\nhttps://earcast.co.kr/contents/content-9');
    });
  });
});
