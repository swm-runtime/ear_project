import {
  parseEventCount,
  parseRetention,
  parseTotals,
  ReportRow,
} from './ga4-report.parse';
import { shiftDate } from './ga4.service';

const row = (dims: string[], mets: string[]): ReportRow => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: mets.map((value) => ({ value })),
});

describe('parseTotals', () => {
  it('첫 행에서 활성·신규를 읽는다', () => {
    expect(parseTotals([row([], ['1234', '56'])])).toEqual({
      activeUsers: 1234,
      newUsers: 56,
    });
  });

  it('행이 없으면 0 — GA4 는 값이 없는 날을 빈 응답으로 준다', () => {
    expect(parseTotals([])).toEqual({ activeUsers: 0, newUsers: 0 });
    expect(parseTotals(null)).toEqual({ activeUsers: 0, newUsers: 0 });
  });

  it('숫자가 아닌 값은 0 으로 본다', () => {
    expect(parseTotals([row([], ['', 'x'])])).toEqual({
      activeUsers: 0,
      newUsers: 0,
    });
  });
});

describe('parseEventCount', () => {
  const rows = [row(['sign_up'], ['7']), row(['play_start'], ['99'])];

  it('이름이 맞는 행의 값을 쓴다', () => {
    expect(parseEventCount(rows, 'sign_up')).toBe(7);
  });

  it('없는 이벤트는 0', () => {
    expect(parseEventCount(rows, 'purchase')).toBe(0);
    expect(parseEventCount([], 'sign_up')).toBe(0);
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

  it('해당 코호트의 n일차 활성 / 0일차 총원을 나눈다', () => {
    const r = parseRetention(rows, [
      { name: 'd1', nthDay: 1 },
      { name: 'd7', nthDay: 7 },
    ]);
    expect(r.d1).toBeCloseTo(0.41);
    expect(r.d7).toBeCloseTo(0.1875);
  });

  it('0 을 채운 nthDay 문자열을 숫자로 비교한다', () => {
    expect(parseRetention(rows, [{ name: 'd1', nthDay: 1 }]).d1).not.toBeNull();
  });

  it('N일차 행이 없으면 0% 다 — GA4 는 0 인 행을 주지 않는다. "모른다"가 아니다', () => {
    expect(parseRetention(rows, [{ name: 'churned', nthDay: 1 }]).churned).toBe(
      0,
    );
  });

  it('0일차 행조차 없으면 null — 코호트 자체가 빈 날이다', () => {
    expect(
      parseRetention(rows, [{ name: 'nobody', nthDay: 1 }]).nobody,
    ).toBeNull();
    expect(parseRetention([], [{ name: 'd1', nthDay: 1 }]).d1).toBeNull();
    expect(parseRetention(null, [{ name: 'd1', nthDay: 1 }]).d1).toBeNull();
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
