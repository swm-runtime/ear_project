import { UserMarket } from '@/modules/user/user.enum';

import {
  DailyMetrics,
  delta,
  formatChurnReport,
  formatDailyMetrics,
  formatDuration,
  formatListenTime,
  formatRetention,
  reportDate,
} from './daily-metrics.format';

const base: DailyMetrics = {
  date: '2026-09-28',
  members: { total: 1351, signUps: 7 },
  markets: [
    {
      market: UserMarket.KR,
      totalUsers: 1350,
      signUps: 7,
      listeners: 30,
      plays: 40,
      listenSec: 45_000,
    },
    {
      market: UserMarket.GLOBAL,
      totalUsers: 1,
      signUps: 0,
      listeners: 0,
      plays: 0,
      listenSec: 0,
    },
  ],
  users: {
    active: 1234,
    activePrev: 1200,
    sessions: 1500,
    avgSessionSec: 116.08,
    active7d: 4000,
  },
  acquisition: {
    signUps: 7,
    onboardingCompletes: 5,
    pushResponses: 4,
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

describe('formatListenTime', () => {
  it('1시간 미만은 분, 그 이상은 소수 한 자리 시간이다', () => {
    expect(formatListenTime(0)).toBe('0분');
    expect(formatListenTime(2_520)).toBe('42분');
    expect(formatListenTime(3_600)).toBe('1시간');
    expect(formatListenTime(45_000)).toBe('12.5시간');
    expect(formatListenTime(36_000_000)).toBe('10,000시간');
  });
});

describe('formatDailyMetrics', () => {
  it('제목에 날짜와 요일을 적는다 — 09-28 은 월요일이다', () => {
    expect(formatDailyMetrics(base)).toContain(
      '*2026-09-28 (월) 이어 일간 지표*',
    );
  });

  it('서버 값 두 줄(가입자·시장별 청취) 뒤에 퍼널 순서로 4묶음이다 — 사용자·획득·재생·리텐션', () => {
    const lines = formatDailyMetrics(base).split('\n');
    expect(lines[1]).toMatch(/^\*가입자\*/);
    expect(lines[2]).toMatch(/^\*시장별 청취\*/);
    expect(lines[3]).toMatch(/^\*사용자\*/);
    expect(lines[4]).toMatch(/^\*획득\*/);
    expect(lines[5]).toMatch(/^\*재생\*/);
    expect(lines[6]).toMatch(/^\*리텐션\*/);
  });

  it('가입자 줄에 현재 가입자 수와 어제 가입 수(서버 값)를 적고, 각각 시장별로 나눈다', () => {
    expect(formatDailyMetrics(base)).toContain(
      '*가입자*   현재 1,351명 (KR 1,350 · GLOBAL 1)  ·  어제 가입 7명 (KR 7 · GLOBAL 0)',
    );
  });

  it('시장별 청취 줄은 시장마다 청취자·재생·청취 시간이다 — 0 인 시장도 적는다', () => {
    expect(formatDailyMetrics(base)).toContain(
      '*시장별 청취*  KR 30명 · 재생 40 · 12.5시간  ·  GLOBAL 0명 · 재생 0 · 0분',
    );
  });

  it('전일 대비 방향을 붙인다 — 오르면 ▲, 내리면 ▼', () => {
    expect(formatDailyMetrics(base)).toContain('활성 1,234 (▲34)');
    expect(
      formatDailyMetrics({
        ...base,
        users: { ...base.users, active: 1100 },
      }),
    ).toContain('활성 1,100 (▼100)');
  });

  it('사용자 줄에 신규(GA4 첫 실행)를 싣지 않는다 — 가입은 가입자 줄(서버)이 센다', () => {
    const line = formatDailyMetrics(base)
      .split('\n')
      .find((l) => l.startsWith('*사용자*'));
    expect(line).toBe(
      '*사용자*   활성 1,234 (▲34)  ·  세션 1,500 (평균 1분 56초)  ·  7일 활성 4,000',
    );
  });

  it('가입 → 온보딩 완료 전환율을 적고, 가입이 0 이면 비율을 생략한다', () => {
    expect(formatDailyMetrics(base)).toContain('가입 7 → 온보딩 완료 5 (71%)');
    const none = {
      ...base,
      acquisition: {
        ...base.acquisition,
        signUps: 0,
        onboardingCompletes: 0,
      },
    };
    expect(formatDailyMetrics(none)).toContain('가입 0 → 온보딩 완료 0  ·');
  });

  it('획득 줄의 가입은 GA4 값만 적는다 — 서버 값은 가입자 줄에 있다', () => {
    const drift = {
      ...base,
      members: { total: 1351, signUps: 7 },
      acquisition: { ...base.acquisition, signUps: 10 },
    };
    const text = formatDailyMetrics(drift);
    expect(text).toContain('가입 10 → 온보딩 완료 5 (50%)');
    expect(text).toContain('어제 가입 7명');
    expect(text).not.toContain('(서버');
  });

  it('각주에 하루 범위(전 줄 KST 00~24시)와 출처를 적는다 — 현재 가입자만 보고 시각 값', () => {
    expect(formatDailyMetrics(base)).toContain(
      '어제 = KST 00~24시(전 줄 같은 범위) · 현재 가입자는 보고 시각 값 · 가입자·시장별 청취 줄은 서버 값, 나머지는 GA4 운영 스트림',
    );
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

describe('formatChurnReport', () => {
  const churn = {
    date: '2026-09-28',
    withdrawals: [
      { reasonCode: 'price', count: 1 },
      { reasonCode: null, count: 1 },
      { reasonCode: 'low_usage', count: 2 },
      { reasonCode: 'content_quailty', count: 1 },
    ],
    appRemoves: 4,
  };

  it('제목·탈퇴 합계·앱 삭제(Android) 순서다 — 지표 보고와 같은 날짜·요일', () => {
    const lines = formatChurnReport(churn).split('\n');
    expect(lines[0]).toContain('*2026-09-28 (월) 이어 이탈*');
    expect(lines[1]).toBe('*탈퇴*      5명');
    expect(lines.at(-2)).toBe('*앱 삭제*  Android 4');
  });

  it('사유는 건수 많은 순, 같으면 화면 순서, 사유 미선택은 맨 뒤다', () => {
    const lines = formatChurnReport(churn).split('\n').slice(2, 6);
    expect(lines).toEqual([
      '    · 들을 시간이 없거나 잘 안 쓰게 됐어요  2',
      '    · 콘텐츠 품질이 기대에 못 미쳤어요  1',
      '    · 구독 가격이 부담됐어요  1',
      '    · 사유 미선택  1',
    ]);
  });

  it('모르는 사유 코드는 원값을 쓴다 — 조용히 비는 것보다 낫다', () => {
    expect(
      formatChurnReport({
        ...churn,
        withdrawals: [{ reasonCode: 'new_reason', count: 1 }],
      }),
    ).toContain('· new_reason  1');
  });

  it('탈퇴가 없어도 보낸다 — 0명과 앱 삭제 줄만', () => {
    const text = formatChurnReport({
      ...churn,
      withdrawals: [],
      appRemoves: 0,
    });
    expect(text.split('\n')).toHaveLength(4);
    expect(text).toContain('*탈퇴*      0명');
    expect(text).toContain('Android 0');
  });

  it('각주에 하루 범위와 출처를 적는다 — 탈퇴·앱 삭제 모두 KST 00~24시', () => {
    expect(formatChurnReport(churn)).toContain(
      '어제 = KST 00~24시 · 탈퇴는 서버 값 · 앱 삭제는 GA4 app_remove 운영 스트림',
    );
  });

  it('운영이 아니면 환경을 앞에 붙인다', () => {
    expect(formatChurnReport(churn, 'development')).toMatch(
      /^\[development\] /,
    );
    expect(formatChurnReport(churn, 'production')).toMatch(/^:door:/);
  });
});
