import { describe, expect, it } from '@jest/globals';

import { toServiceDayIndex, toWeekRangeParts } from './profile.format';

describe('toServiceDayIndex — 오늘 요일은 서버 날짜 라벨끼리의 셈(KAN-197)', () => {
  it('주 월요일 라벨과 오늘 서비스 날짜의 차이가 요일 칸이다(0 = 월)', () => {
    expect(toServiceDayIndex('2026-10-12', '2026-10-12')).toBe(0);
    expect(toServiceDayIndex('2026-10-12', '2026-10-15')).toBe(3);
    expect(toServiceDayIndex('2026-10-12', '2026-10-18')).toBe(6);
  });

  it('달을 넘는 주도 같은 셈이다', () => {
    expect(toServiceDayIndex('2026-10-26', '2026-11-01')).toBe(6);
  });

  it('서비스 날짜를 아직 못 받았으면 오늘을 모른다(null)', () => {
    expect(toServiceDayIndex('2026-10-12', null)).toBeNull();
  });

  it('서비스 날짜가 표시 주 밖이면(05시를 지나 한쪽만 새로 받음) null', () => {
    expect(toServiceDayIndex('2026-10-12', '2026-10-11')).toBeNull();
    expect(toServiceDayIndex('2026-10-12', '2026-10-19')).toBeNull();
  });
});

describe('toWeekRangeParts — 주 범위 양 끝(표기 전용 +6일)', () => {
  it('월·해를 넘어도 달력으로 셈한다', () => {
    expect(toWeekRangeParts('2026-10-26')).toEqual({
      start: { year: 2026, month: 10, day: 26 },
      end: { year: 2026, month: 11, day: 1 },
    });
    expect(toWeekRangeParts('2026-12-28').end).toEqual({ year: 2027, month: 1, day: 3 });
  });
});
