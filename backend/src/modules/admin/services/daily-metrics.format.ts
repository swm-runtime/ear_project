/**
 * 일일 지표 Slack 문구 — **순수 함수만 둔다.** GA4·DB 조회는 각 서비스가 하고, 여기서는
 * 받은 숫자를 사람이 읽는 4줄로 바꾼다. 그래야 자격 없이도 검증된다.
 */

export type DailyMetrics = {
  /** 보고 대상 날짜 (`YYYY-MM-DD`, KST) */
  date: string;
  /** 사용자 — GA4 운영 스트림 */
  users: {
    active: number;
    activePrev: number;
    new: number;
    newPrev: number;
    sessions: number;
    avgSessionSec: number;
    active7d: number;
  };
  /** 획득 — 전부 GA4. `serverSignUps` 만 서버 대조 값이다(GA4 `sign_up` 과 다를 때 괄호로 적는다) */
  acquisition: {
    signUps: number;
    serverSignUps: number;
    onboardingCompletes: number;
    pushResponses: number;
    withdrawals: number;
  };
  /** 재생 — 전부 GA4. 완청은 `play_complete`(끝에 닿은 횟수)라 서버의 90% 판정과 다른 값이다 */
  playback: {
    playStarts: number;
    playStartUsers: number;
    completes: number;
    abandons: number;
    dripPlays: number;
    saves: number;
  };
  /** 코호트 리텐션 — size 가 0 이면 표본이 없다(0% 와 다르다) */
  retention: {
    d1: { rate: number | null; size: number };
    d7: { rate: number | null; size: number };
  };
};

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const n = (v: number): string => v.toLocaleString('en-US');

/** 전일 대비 — 방향이 숫자보다 먼저 읽힌다. 같으면 아무것도 붙이지 않는다 */
export function delta(now: number, prev: number): string {
  const d = now - prev;
  if (d === 0) return '';
  return d > 0 ? ` (▲${n(d)})` : ` (▼${n(-d)})`;
}

/** `1분 56초` · 60초 미만은 `42초` */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}

/** 리텐션 한 칸 — 표본이 없으면 `—`, 있으면 `33% (3명 중 1)` */
export function formatRetention(r: {
  rate: number | null;
  size: number;
}): string {
  if (r.rate === null || r.size === 0) return '— (표본 없음)';
  return `${Math.round(r.rate * 100)}% (${n(r.size)}명 중 ${n(Math.round(r.rate * r.size))})`;
}

/** 전환율 — 분모 0 이면 비율을 적지 않는다 */
const ratio = (num: number, den: number): string =>
  den === 0 ? '' : ` (${Math.round((num / den) * 100)}%)`;

/**
 * 가입 한 칸 — GA4 값을 적고, 서버 건수와 **다를 때만** 괄호로 함께 적는다(`가입 11 (서버 10)`).
 * GA4 `sign_up` 은 재로그인을 또 셀 수 있어, 어긋남이 보여야 숫자를 믿을 수 있다. 같으면 한 숫자만
 */
export function formatSignUps(ga4: number, server: number): string {
  return ga4 === server ? n(ga4) : `${n(ga4)} (서버 ${n(server)})`;
}

/**
 * 하루치 보고 — 퍼널 순서(사용자 → 획득 → 재생 → 리텐션)로 4줄.
 * 운영이 아니면 환경을 앞에 붙인다(가입 알림과 같은 규칙).
 */
export function formatDailyMetrics(
  m: DailyMetrics,
  environment?: string,
): string {
  const prefix =
    environment && environment !== 'production' ? `[${environment}] ` : '';
  const day = WEEKDAY[new Date(`${m.date}T00:00:00Z`).getUTCDay()];
  const u = m.users;
  const a = m.acquisition;
  const p = m.playback;
  return [
    `${prefix}:bar_chart: *${m.date} (${day}) 이어 일간 지표*  ·  운영 스트림`,
    `*사용자*   활성 ${n(u.active)}${delta(u.active, u.activePrev)}  ·  신규 ${n(u.new)}${delta(u.new, u.newPrev)}  ·  세션 ${n(u.sessions)} (평균 ${formatDuration(u.avgSessionSec)})  ·  7일 활성 ${n(u.active7d)}`,
    `*획득*     가입 ${formatSignUps(a.signUps, a.serverSignUps)} → 온보딩 완료 ${n(a.onboardingCompletes)}${ratio(a.onboardingCompletes, a.signUps)}  ·  푸시 응답 ${n(a.pushResponses)}  ·  탈퇴 ${n(a.withdrawals)}`,
    `*재생*     시작 ${n(p.playStarts)} (${n(p.playStartUsers)}명)  ·  완청 ${n(p.completes)}  ·  중도 이탈 ${n(p.abandons)}  ·  드립 재생 ${n(p.dripPlays)}  ·  담기 ${n(p.saves)}`,
    `*리텐션*   D1 ${formatRetention(m.retention.d1)}  ·  D7 ${formatRetention(m.retention.d7)}`,
    `_▲▼ 전일 대비 · 전부 GA4 운영 스트림(00시 경계) · 가입의 괄호는 서버 값(04시 경계)_`,
  ].join('\n');
}

/**
 * 보고 대상 날짜 — **어제**다(KST). 오늘은 아직 안 끝났고, GA4 는 당일 데이터를
 * 처리하는 데 시간이 걸린다. 17시에 "오늘"을 적으면 반쪽짜리 수를 확정값처럼 읽게 된다.
 */
export function reportDate(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}
