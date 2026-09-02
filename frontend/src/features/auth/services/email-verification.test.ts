/**
 * 이메일 인증 판정 로직 테스트(convention.md 7.2 — 발송 버튼 활성·카운트다운·잠금 안내의 재료다).
 * 규칙 소유: auth.md 4.5 · auth-uiux.md 4.8·4.10·4.14.
 */
import { describe, expect, it } from '@jest/globals';

import {
  formatCountdown,
  isEmailFormatValid,
  lockRemainingMinutes,
  remainingSeconds,
} from './email-verification';

describe('email-verification', () => {
  describe('isEmailFormatValid', () => {
    it('일반적인 주소는 통과한다', () => {
      expect(isEmailFormatValid('user@example.com')).toBe(true);
      expect(isEmailFormatValid('  user@example.com  ')).toBe(true);
    });

    it('골뱅이·도메인이 없으면 형식 오류다', () => {
      expect(isEmailFormatValid('userexample.com')).toBe(false);
      expect(isEmailFormatValid('user@')).toBe(false);
      expect(isEmailFormatValid('user@example')).toBe(false);
      expect(isEmailFormatValid('')).toBe(false);
    });

    it('공백이 끼면 형식 오류다', () => {
      expect(isEmailFormatValid('us er@example.com')).toBe(false);
    });
  });

  describe('remainingSeconds', () => {
    it('만료 시각까지 남은 초를 올림으로 계산한다', () => {
      // given — 2.5초 남은 시점
      const now = Date.parse('2026-08-15T09:00:00.000Z');
      const target = '2026-08-15T09:00:02.500Z';
      // then
      expect(remainingSeconds(target, now)).toBe(3);
    });

    it('시각이 지났으면 0이다 — 음수를 만들지 않는다', () => {
      const now = Date.parse('2026-08-15T09:05:00Z');
      expect(remainingSeconds('2026-08-15T09:00:00Z', now)).toBe(0);
    });
  });

  describe('formatCountdown', () => {
    it('mm:ss로 표기한다(auth-uiux.md 4.10 — 02:41 형태)', () => {
      expect(formatCountdown(161)).toBe('02:41');
      expect(formatCountdown(180)).toBe('03:00');
      expect(formatCountdown(9)).toBe('00:09');
    });

    it('0 이하는 00:00이다', () => {
      expect(formatCountdown(0)).toBe('00:00');
      expect(formatCountdown(-5)).toBe('00:00');
    });
  });

  describe('lockRemainingMinutes', () => {
    it('남은 초를 분으로 올림한다 — 내림하면 "0분 후"가 된다', () => {
      // given — 43분 잠금(2580초)과 1초 남은 잠금
      expect(lockRemainingMinutes(2580)).toBe(43);
      expect(lockRemainingMinutes(2581)).toBe(44);
      // then — 최소 1분으로 표기한다
      expect(lockRemainingMinutes(1)).toBe(1);
    });
  });
});
