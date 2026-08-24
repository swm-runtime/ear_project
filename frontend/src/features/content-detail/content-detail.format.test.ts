import { describe, expect, it } from '@jest/globals';

import {
  formatContentDuration,
  formatPublishedDate,
  formatSeriesLabel,
} from './content-detail.format';

describe('content-detail.format', () => {
  describe('formatContentDuration', () => {
    it('861초짜리 콘텐츠는 "14분 21초"로 초 단위까지 표시된다', () => {
      // given — content-detail.md 8장 완료 조건의 예시 값
      const durationSec = 861;
      // when
      const result = formatContentDuration(durationSec);
      // then
      expect(result).toBe('14분 21초');
    });

    it('초가 한 자리면 두 자리로 패딩한다(시안 "15분 08초" — uiux 9장 확정 전 규칙)', () => {
      expect(formatContentDuration(908)).toBe('15분 08초');
    });

    it('정각이면 "15분 00초"로 표기한다(uiux 9장 확정 전 시안 규칙)', () => {
      expect(formatContentDuration(900)).toBe('15분 00초');
    });

    it('1분 미만이면 "0분 45초"로 표기한다(uiux 9장 확정 전 시안 규칙)', () => {
      expect(formatContentDuration(45)).toBe('0분 45초');
    });

    it('소수점 초는 버림으로 처리한다', () => {
      expect(formatContentDuration(861.9)).toBe('14분 21초');
    });
  });

  describe('formatPublishedDate', () => {
    it('발행일을 "YYYY년 M월 D일" 형식(월·일 패딩 없음)으로 표시한다', () => {
      // given — 시간대 경계에 걸리지 않게 로컬 정오 기준 ISO 문자열을 만든다
      const iso = new Date(2026, 7, 12, 12, 0, 0).toISOString();
      // when / then
      expect(formatPublishedDate(iso)).toBe('2026년 8월 12일');
    });
  });

  describe('formatSeriesLabel', () => {
    it('시리즈 정보를 "N부작 중 M화"로 표시한다', () => {
      expect(formatSeriesLabel({ seriesId: 'series-1', episodeNo: 1, totalEpisodes: 3 })).toBe(
        '3부작 중 1화',
      );
    });
  });
});
