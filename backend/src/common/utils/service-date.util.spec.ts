import {
  toPreviousFinalMonthStart,
  toPreviousFinalWeekStart,
  toServiceDate,
} from './service-date.util';

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

  describe('toPreviousFinalWeekStart', () => {
    it('주중에 조회하면 지난주 월요일을 돌려준다', () => {
      // given — 2026-08-07(금) 12:00 KST. 이번 주 월요일은 08-03이다
      const at = new Date('2026-08-07T03:00:00.000Z');

      // when
      const periodStart = toPreviousFinalWeekStart(at);

      // then
      expect(periodStart).toBe('2026-07-27');
    });

    it('월요일 04시부터 직전 확정 주가 한 주 앞으로 넘어간다', () => {
      // given — 2026-08-03(월) 04:00 KST. 새 주가 시작된 시점이다
      const at = new Date('2026-08-02T19:00:00.000Z');

      // when
      const periodStart = toPreviousFinalWeekStart(at);

      // then
      expect(periodStart).toBe('2026-07-27');
    });

    it('월요일 03시 59분은 아직 지난주이므로 2주 전 월요일을 돌려준다', () => {
      // given — 주 경계도 04시다(domain.md 1.2). 자정으로 세면 이 4시간만 다른 주가 실린다
      const at = new Date('2026-08-02T18:59:00.000Z');

      // when
      const periodStart = toPreviousFinalWeekStart(at);

      // then
      expect(periodStart).toBe('2026-07-20');
    });

    it('해가 바뀌어도 전년도 월요일을 돌려준다', () => {
      // given — 2026-01-05(월) 12:00 KST
      const at = new Date('2026-01-05T03:00:00.000Z');

      // when
      const periodStart = toPreviousFinalWeekStart(at);

      // then
      expect(periodStart).toBe('2025-12-29');
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
