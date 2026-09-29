import {
  DailyMetrics,
  formatDailyMetrics,
  reportDate,
} from './daily-metrics.format';

const base: DailyMetrics = {
  date: '2026-09-28',
  activeUsers: 1234,
  newUsers: 56,
  signUps: 7,
  retention: { d1: 0.412, d7: 0.187 },
};

describe('formatDailyMetrics', () => {
  it('숫자에 천 단위 구분자를 넣는다', () => {
    expect(formatDailyMetrics(base)).toContain('1,234명');
  });

  it('리텐션을 백분율 한 자리로 적는다', () => {
    const text = formatDailyMetrics(base);
    expect(text).toContain('D1 41.2%');
    expect(text).toContain('D7 18.7%');
  });

  it('표본이 없으면 0% 가 아니라 — 로 적는다 — 둘은 다른 사실이다', () => {
    const text = formatDailyMetrics({
      ...base,
      retention: { d1: null, d7: 0 },
    });
    expect(text).toContain('D1 —');
    expect(text).toContain('D7 0.0%');
  });

  it('운영이 아니면 환경을 앞에 붙인다', () => {
    expect(formatDailyMetrics(base, 'development')).toMatch(
      /^\[development\] /,
    );
    expect(formatDailyMetrics(base, 'production')).toMatch(/^:bar_chart:/);
    expect(formatDailyMetrics(base)).toMatch(/^:bar_chart:/);
  });
});

describe('reportDate', () => {
  it('KST 기준 어제를 고른다 — 오늘은 아직 안 끝났다', () => {
    // 2026-09-29 17:00 KST = 08:00 UTC
    expect(reportDate(new Date('2026-09-29T08:00:00Z'))).toBe('2026-09-28');
  });

  it('UTC 로는 전날이어도 KST 기준으로 센다', () => {
    // 2026-09-29 00:30 KST = 2026-09-28 15:30 UTC
    expect(reportDate(new Date('2026-09-28T15:30:00Z'))).toBe('2026-09-28');
  });
});
