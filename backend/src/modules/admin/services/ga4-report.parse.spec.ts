import {
  parseEventStats,
  parseRanges,
  parseRetention,
  ReportRow,
} from './ga4-report.parse';
import { shiftDate } from './ga4.service';

const row = (dims: string[], mets: string[]): ReportRow => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: mets.map((value) => ({ value })),
});

describe('parseRanges', () => {
  // dateRange 차원값 = 요청 때 준 이름. 행 순서는 보장되지 않는다
  const rows = [
    row(['w'], ['9', '4', '15', '90.5']),
    row(['y'], ['1', '1', '1', '6.6']),
    row(['p'], ['1', '0', '1', '116']),
  ];

  it('이름으로 찾는다 — 순서와 무관하게', () => {
    const r = parseRanges(rows, ['y', 'p', 'w']);
    expect(r.y).toEqual({
      activeUsers: 1,
      newUsers: 1,
      sessions: 1,
      avgSessionSec: 6.6,
    });
    expect(r.w.activeUsers).toBe(9);
  });

  it('없는 범위는 0 — GA4 는 값이 없는 범위 행을 주지 않는다', () => {
    expect(parseRanges(rows, ['y', 'zzz']).zzz).toEqual({
      activeUsers: 0,
      newUsers: 0,
      sessions: 0,
      avgSessionSec: 0,
    });
    expect(parseRanges(null, ['y']).y.activeUsers).toBe(0);
  });
});

describe('parseEventStats', () => {
  it('이벤트별 건수와 사용자 수를 사전으로', () => {
    const r = parseEventStats([
      row(['play_start'], ['4', '3']),
      row(['sign_up'], ['7', '7']),
    ]);
    expect(r.play_start).toEqual({ count: 4, users: 3 });
    expect(r.sign_up.count).toBe(7);
    expect(r.nothing).toBeUndefined();
  });
});

describe('parseRetention', () => {
  // [cohort, cohortNthDay] × [cohortActiveUsers, cohortTotalUsers] — 2026-09-29 실응답 모양
  const rows = [
    row(['d1', '0000'], ['100', '100']),
    row(['d1', '0001'], ['41', '100']),
    row(['d7', '0000'], ['80', '80']),
    row(['d7', '0007'], ['15', '80']),
    row(['churned', '0000'], ['1', '1']), // 1명 코호트, 아무도 안 돌아옴 → GA4 는 0001 행을 주지 않는다
    row(['churned', '0002'], ['1', '1']),
  ];

  it('해당 코호트의 n일차 활성 / 0일차 총원을 나누고 표본 크기를 함께 준다', () => {
    const r = parseRetention(rows, [
      { name: 'd1', nthDay: 1 },
      { name: 'd7', nthDay: 7 },
    ]);
    expect(r.d1).toEqual({ rate: 0.41, size: 100 });
    expect(r.d7.rate).toBeCloseTo(0.1875);
    expect(r.d7.size).toBe(80);
  });

  it('0 을 채운 nthDay 문자열을 숫자로 비교한다', () => {
    expect(
      parseRetention(rows, [{ name: 'd1', nthDay: 1 }]).d1.rate,
    ).not.toBeNull();
  });

  it('N일차 행이 없으면 0% 다 — GA4 는 0 인 행을 주지 않는다. "모른다"가 아니다', () => {
    expect(
      parseRetention(rows, [{ name: 'churned', nthDay: 1 }]).churned,
    ).toEqual({ rate: 0, size: 1 });
  });

  it('0일차 행조차 없으면 표본 없음(null, size 0) — 코호트 자체가 빈 날이다', () => {
    expect(
      parseRetention(rows, [{ name: 'nobody', nthDay: 1 }]).nobody,
    ).toEqual({ rate: null, size: 0 });
    expect(parseRetention([], [{ name: 'd1', nthDay: 1 }]).d1.rate).toBeNull();
    expect(parseRetention(null, [{ name: 'd1', nthDay: 1 }]).d1.size).toBe(0);
  });
});

describe('shiftDate', () => {
  it('일수를 더하고 뺀다 — 월 경계를 넘어도', () => {
    expect(shiftDate('2026-09-28', -1)).toBe('2026-09-27');
    expect(shiftDate('2026-09-28', -7)).toBe('2026-09-21');
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
