import { toPreviousFinalMonthStart, toServiceDate } from './service-date.util';

describe('serviceDateUtil', () => {
  describe('toServiceDate', () => {
    it('KST 03시 59분의 행위는 전날로 계산한다', () => {
      // given — 2026-08-05 03:59 KST = 2026-08-04 18:59 UTC
      const at = new Date('2026-08-04T18:59:00.000Z');

      // when
      const serviceDate = toServiceDate(at);

      // then
      expect(serviceDate).toBe('2026-08-04');
    });

    it('KST 04시 00분부터 새로운 서비스 날짜가 된다', () => {
      // given — 2026-08-05 04:00 KST = 2026-08-04 19:00 UTC
      const at = new Date('2026-08-04T19:00:00.000Z');

      // when
      const serviceDate = toServiceDate(at);

      // then
      expect(serviceDate).toBe('2026-08-05');
    });

    it('KST 자정 직후는 아직 전날이다', () => {
      // given — 2026-08-05 00:30 KST = 2026-08-04 15:30 UTC
      const at = new Date('2026-08-04T15:30:00.000Z');

      // when
      const serviceDate = toServiceDate(at);

      // then
      expect(serviceDate).toBe('2026-08-04');
    });
  });

  describe('toPreviousFinalMonthStart', () => {
    it('직전 달의 1일을 돌려준다', () => {
      // given
      const at = new Date('2026-05-20T00:00:00.000Z');

      // when
      const periodStart = toPreviousFinalMonthStart(at);

      // then
      expect(periodStart).toBe('2026-04-01');
    });

    it('1월이면 전년 12월을 돌려준다', () => {
      // given
      const at = new Date('2026-01-15T00:00:00.000Z');

      // when
      const periodStart = toPreviousFinalMonthStart(at);

      // then
      expect(periodStart).toBe('2025-12-01');
    });

    it('KST 기준으로 달을 판정한다', () => {
      // given — 2026-05-01 08:00 KST = 2026-04-30 23:00 UTC (UTC로는 아직 4월)
      const at = new Date('2026-04-30T23:00:00.000Z');

      // when
      const periodStart = toPreviousFinalMonthStart(at);

      // then
      expect(periodStart).toBe('2026-04-01');
    });
  });
});
