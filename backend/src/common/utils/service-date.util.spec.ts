import {
  serviceDateStart,
  serviceDayStartHour,
  toPreviousFinalMonthStart,
  toPreviousFinalWeekStart,
  toServiceDate,
  toServiceDayRange,
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

  describe('toServiceDayRange', () => {
    it('KST 04시 이후의 시각은 그날 04시부터 다음 날 04시 전까지다', () => {
      // given — 2026-09-17 05:00 KST = 2026-09-16 20:00 UTC
      const at = new Date('2026-09-16T20:00:00.000Z');

      // when
      const range = toServiceDayRange(at);

      // then — 2026-09-17 04:00 KST ~ 2026-09-18 04:00 KST
      expect(range.start.toISOString()).toBe('2026-09-16T19:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-09-17T19:00:00.000Z');
    });

    it('KST 03시 59분은 전날 서비스 날짜의 범위에 든다', () => {
      // given — 2026-09-17 03:59 KST = 2026-09-16 18:59 UTC
      const at = new Date('2026-09-16T18:59:00.000Z');

      // when
      const range = toServiceDayRange(at);

      // then — 2026-09-16 04:00 KST 시작
      expect(range.start.toISOString()).toBe('2026-09-15T19:00:00.000Z');
      expect(at.getTime()).toBeLessThan(range.end.getTime());
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

    it('월이 바뀌는 날 04시 이전은 아직 전달로 본다', () => {
      // given — 2026-05-01 02:00 KST = 2026-04-30 17:00 UTC.
      // 04시 경계 안이라 서비스 날짜로는 아직 4월 30일이고, 4월은 끝나지 않았다
      const at = new Date('2026-04-30T17:00:00.000Z');

      // when
      const periodStart = toPreviousFinalMonthStart(at);

      // then — 자정으로 세면 4월을 가리켜, 04시 배치가 아직 쓰지 않은 구간을 조회한다
      expect(periodStart).toBe('2026-03-01');
    });

    it('월이 바뀌는 날 04시를 넘기면 전달이 확정된다', () => {
      // given — 2026-05-01 04:00 KST = 2026-04-30 19:00 UTC
      const at = new Date('2026-04-30T19:00:00.000Z');

      // when
      const periodStart = toPreviousFinalMonthStart(at);

      // then
      expect(periodStart).toBe('2026-04-01');
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

  describe('05:00 전환 (SERVICE_DAY_BOUNDARY_05_FROM — KAN-149)', () => {
    const key = 'SERVICE_DAY_BOUNDARY_05_FROM';
    const original = process.env[key];
    // 전환 = 2026-10-14 05:00 KST = 2026-10-13 20:00 UTC
    const switchAt = '2026-10-14T05:00:00+09:00';

    afterEach(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });

    it('env 가 비어 있으면 04:00 경계 그대로다 — 머지만으로 운영이 바뀌지 않는다', () => {
      delete process.env[key];

      expect(serviceDayStartHour(new Date('2099-01-01T00:00:00.000Z'))).toBe(4);
      // 2026-10-20 04:30 KST → 10-20
      expect(toServiceDate(new Date('2026-10-19T19:30:00.000Z'))).toBe(
        '2026-10-20',
      );
    });

    it('전환 뒤 04:59 는 전날, 05:00 부터 오늘이다', () => {
      process.env[key] = switchAt;

      // 2026-10-20 04:59 KST = 10-19 19:59 UTC → 10-19
      expect(toServiceDate(new Date('2026-10-19T19:59:00.000Z'))).toBe(
        '2026-10-19',
      );
      // 2026-10-20 05:00 KST = 10-19 20:00 UTC → 10-20
      expect(toServiceDate(new Date('2026-10-19T20:00:00.000Z'))).toBe(
        '2026-10-20',
      );
      expect(serviceDayStartHour(new Date('2026-10-19T20:00:00.000Z'))).toBe(5);
    });

    it('전환 전 시각은 04:00 경계로 계산한다 — 과거 play_date·재집계가 그대로 맞는다', () => {
      process.env[key] = switchAt;

      // 2026-10-01 04:30 KST = 09-30 19:30 UTC → 10-01 (옛 규칙)
      expect(toServiceDate(new Date('2026-09-30T19:30:00.000Z'))).toBe(
        '2026-10-01',
      );
      expect(serviceDayStartHour(new Date('2026-09-30T19:30:00.000Z'))).toBe(4);
    });

    it('전환일 하루는 04:00 에 시작해 다음 날 05:00 에 끝난다 — 25시간, 겹침·빈틈 없음', () => {
      process.env[key] = switchAt;

      // 전환일 D = 2026-10-14. 04:00 KST(옛 규칙) ~ 10-15 05:00 KST(새 규칙)
      expect(serviceDateStart('2026-10-14').toISOString()).toBe(
        '2026-10-13T19:00:00.000Z',
      );
      expect(serviceDateStart('2026-10-15').toISOString()).toBe(
        '2026-10-14T20:00:00.000Z',
      );

      const range = toServiceDayRange(new Date('2026-10-14T03:00:00.000Z')); // D 12:00 KST
      expect(range.start.toISOString()).toBe('2026-10-13T19:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-10-14T20:00:00.000Z');

      // D 04:30 KST(전환 전 시각) → D, D+1 04:30 KST(전환 뒤) → 아직 D
      expect(toServiceDate(new Date('2026-10-13T19:30:00.000Z'))).toBe(
        '2026-10-14',
      );
      expect(toServiceDate(new Date('2026-10-14T19:30:00.000Z'))).toBe(
        '2026-10-14',
      );
    });

    it('전환 전 라벨의 시작은 04:00, 전환 뒤 라벨은 05:00 이다', () => {
      process.env[key] = switchAt;

      expect(serviceDateStart('2026-10-13').toISOString()).toBe(
        '2026-10-12T19:00:00.000Z',
      );
      expect(serviceDateStart('2026-10-20').toISOString()).toBe(
        '2026-10-19T20:00:00.000Z',
      );
    });

    it('전환 뒤 주·월 경계도 05:00 을 따른다', () => {
      process.env[key] = switchAt;

      // 2026-10-19(월) 04:30 KST = 10-18 19:30 UTC → 아직 지난주(10-12 시작)이므로 직전 확정 주는 10-05
      expect(
        toPreviousFinalWeekStart(new Date('2026-10-18T19:30:00.000Z')),
      ).toBe('2026-10-05');
      // 2026-10-19(월) 05:00 KST → 이번 주 10-19, 직전 확정 주 10-12
      expect(
        toPreviousFinalWeekStart(new Date('2026-10-18T20:00:00.000Z')),
      ).toBe('2026-10-12');
      // 2026-11-01 04:30 KST → 아직 10월 → 직전 확정 월 9월
      expect(
        toPreviousFinalMonthStart(new Date('2026-10-31T19:30:00.000Z')),
      ).toBe('2026-09-01');
      // 2026-11-01 05:00 KST → 11월 → 직전 확정 월 10월
      expect(
        toPreviousFinalMonthStart(new Date('2026-10-31T20:00:00.000Z')),
      ).toBe('2026-10-01');
    });

    it('파싱이 안 되는 값은 전환 없음으로 본다(기동 검증이 먼저 막는다)', () => {
      process.env[key] = 'not-a-date';

      expect(serviceDayStartHour(new Date('2099-01-01T00:00:00.000Z'))).toBe(4);
    });
  });
});
