import {
  DailyMetrics,
  delta,
  formatDailyMetrics,
  formatDuration,
  formatRetention,
  reportDate,
} from './daily-metrics.format';

const base: DailyMetrics = {
  date: '2026-09-28',
  users: {
    active: 1234,
    activePrev: 1200,
    new: 56,
    newPrev: 60,
    sessions: 1500,
    avgSessionSec: 116.08,
    active7d: 4000,
  },
  acquisition: {
    signUps: 7,
    onboardingCompletes: 5,
    pushResponses: 4,
    withdrawals: 1,
  },
  playback: {
    playStarts: 40,
    playStartUsers: 30,
    completes: 12,
    abandons: 9,
    dripPlays: 3,
    saves: 8,
  },
  retention: { d1: { rate: 0.412, size: 100 }, d7: { rate: 0.1875, size: 80 } },
};

describe('formatDailyMetrics', () => {
  it('제목에 날짜와 요일을 적는다 — 09-28 은 월요일이다', () => {
    expect(formatDailyMetrics(base)).toContain(
      '*2026-09-28 (월) 이어 일간 지표*',
    );
  });

  it('퍼널 순서로 4묶음이다 — 사용자·획득·재생·리텐션', () => {
    const lines = formatDailyMetrics(base).split('\n');
    expect(lines[1]).toMatch(/^\*사용자\*/);
    expect(lines[2]).toMatch(/^\*획득\*/);
    expect(lines[3]).toMatch(/^\*재생\*/);
    expect(lines[4]).toMatch(/^\*리텐션\*/);
  });

  it('전일 대비 방향을 붙인다 — 오르면 ▲, 내리면 ▼', () => {
    const text = formatDailyMetrics(base);
    expect(text).toContain('활성 1,234 (▲34)');
    expect(text).toContain('신규 56 (▼4)');
  });

  it('가입 → 온보딩 완료 전환율을 적고, 가입이 0 이면 비율을 생략한다', () => {
    expect(formatDailyMetrics(base)).toContain('가입 7 → 온보딩 완료 5 (71%)');
    const none = {
      ...base,
      acquisition: { ...base.acquisition, signUps: 0, onboardingCompletes: 0 },
    };
    expect(formatDailyMetrics(none)).toContain('가입 0 → 온보딩 완료 0  ·');
  });

  it('완청 건수를 재생 줄에 넣는다', () => {
    expect(formatDailyMetrics(base)).toContain('완청 12');
  });

  it('리텐션은 비율과 표본을 함께 적고, 표본이 없으면 — 다 (0% 와 다르다)', () => {
    expect(formatDailyMetrics(base)).toContain('D1 41% (100명 중 41)');
    const empty = {
      ...base,
      retention: { d1: { rate: null, size: 0 }, d7: { rate: 0, size: 3 } },
    };
    const text = formatDailyMetrics(empty);
    expect(text).toContain('D1 — (표본 없음)');
    expect(text).toContain('D7 0% (3명 중 0)');
  });

  it('운영이 아니면 환경을 앞에 붙인다', () => {
    expect(formatDailyMetrics(base, 'development')).toMatch(
      /^\[development\] /,
    );
    expect(formatDailyMetrics(base, 'production')).toMatch(/^:bar_chart:/);
  });
});

describe('보조 함수', () => {
  it('delta — 같으면 빈 문자열', () => {
    expect(delta(5, 5)).toBe('');
    expect(delta(7, 5)).toBe(' (▲2)');
    expect(delta(3, 5)).toBe(' (▼2)');
  });
  it('formatDuration — 60초 미만은 초만, 이상은 분·초', () => {
    expect(formatDuration(42.4)).toBe('42초');
    expect(formatDuration(116.08)).toBe('1분 56초');
  });
  it('formatRetention — 반올림한 복귀 인원을 함께 적는다', () => {
    expect(formatRetention({ rate: 1 / 3, size: 3 })).toBe('33% (3명 중 1)');
  });
});

describe('reportDate', () => {
  it('KST 기준 어제를 고른다 — 오늘은 아직 안 끝났다', () => {
    expect(reportDate(new Date('2026-09-29T08:00:00Z'))).toBe('2026-09-28');
  });
  it('UTC 로는 전날이어도 KST 기준으로 센다', () => {
    expect(reportDate(new Date('2026-09-28T15:30:00Z'))).toBe('2026-09-28');
  });
});
