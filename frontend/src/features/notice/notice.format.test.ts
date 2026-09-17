import { describe, expect, it } from '@jest/globals';

import { formatNoticeDate } from './notice.format';

describe('notice.format', () => {
  describe('formatNoticeDate', () => {
    it('발행 시각을 "YYYY.MM.DD" 형식으로 표시한다', () => {
      // given — 시간대 경계에 걸리지 않게 로컬 정오 기준 ISO 문자열을 만든다
      const iso = new Date(2026, 8, 17, 12, 0, 0).toISOString();
      // when
      const result = formatNoticeDate(iso);
      // then
      expect(result).toBe('2026.09.17');
    });

    it('월·일이 한 자리면 두 자리로 패딩한다', () => {
      // given
      const iso = new Date(2026, 0, 5, 12, 0, 0).toISOString();
      // when
      const result = formatNoticeDate(iso);
      // then
      expect(result).toBe('2026.01.05');
    });

    it('시각은 표기하지 않는다 — 같은 날의 다른 시각은 같은 문자열이다', () => {
      // given
      const morning = new Date(2026, 11, 31, 1, 0, 0).toISOString();
      const night = new Date(2026, 11, 31, 23, 0, 0).toISOString();
      // when / then
      expect(formatNoticeDate(morning)).toBe('2026.12.31');
      expect(formatNoticeDate(night)).toBe('2026.12.31');
    });
  });
});
