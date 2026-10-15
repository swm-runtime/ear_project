/**
 * 일일 보고 Slack 문구 — **순수 함수만 둔다.** GA4·DB 조회는 각 서비스가 하고, 여기서는
 * 받은 숫자를 사람이 읽는 줄로 바꾼다. 그래야 자격 없이도 검증된다.
 *
 * 17:00 에 메시지 두 개가 나간다 — 지표(`formatDailyMetrics`)와 이탈(`formatChurnReport`, 2026-10-15).
 * 이탈을 지표에 섞으면 퍼널 숫자 사이에 사유 목록이 끼어 둘 다 읽기 어려워서 나눴다.
 */

import { serviceDayStartHour } from '@/common/utils/service-date.util';
import { WithdrawalReason } from '@/modules/user/user.enum';

export type DailyMetrics = {
  /** 보고 대상 날짜 (`YYYY-MM-DD`, KST) */
  date: string;
  /**
   * 가입자 — **서버 값**(2026-10-13 — 건마다 오던 가입 알림을 대신한다).
   * `total` 은 보고 시각의 `users` 행 수(탈퇴는 행을 지워 빠진다), `signUps` 는 보고일 서비스 날짜의 가입 건수
   */
  members: {
    total: number;
    signUps: number;
  };
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
  /** 획득 — 전부 GA4. 서버 가입 건수는 `members` 줄에, 탈퇴는 이탈 보고에 따로 적는다 */
  acquisition: {
    signUps: number;
    onboardingCompletes: number;
    pushResponses: number;
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
 * 하루치 보고 — 가입자(서버) 한 줄 뒤에 퍼널 순서(사용자 → 획득 → 재생 → 리텐션)로 4줄.
 * 운영이 아니면 환경을 앞에 붙인다(건별 Slack 알림과 같은 규칙).
 */
export function formatDailyMetrics(
  m: DailyMetrics,
  environment?: string,
): string {
  const prefix = envPrefix(environment);
  const day = weekday(m.date);
  const mb = m.members;
  const u = m.users;
  const a = m.acquisition;
  const p = m.playback;
  return [
    `${prefix}:bar_chart: *${m.date} (${day}) 이어 일간 지표*  ·  운영 스트림`,
    `*가입자*   현재 ${n(mb.total)}명  ·  어제 가입 ${n(mb.signUps)}명`,
    `*사용자*   활성 ${n(u.active)}${delta(u.active, u.activePrev)}  ·  신규 ${n(u.new)}${delta(u.new, u.newPrev)}  ·  세션 ${n(u.sessions)} (평균 ${formatDuration(u.avgSessionSec)})  ·  7일 활성 ${n(u.active7d)}`,
    `*획득*     가입 ${n(a.signUps)} → 온보딩 완료 ${n(a.onboardingCompletes)}${ratio(a.onboardingCompletes, a.signUps)}  ·  푸시 응답 ${n(a.pushResponses)}`,
    `*재생*     시작 ${n(p.playStarts)} (${n(p.playStartUsers)}명)  ·  완청 ${n(p.completes)}  ·  중도 이탈 ${n(p.abandons)}  ·  드립 재생 ${n(p.dripPlays)}  ·  담기 ${n(p.saves)}`,
    `*리텐션*   D1 ${formatRetention(m.retention.d1)}  ·  D7 ${formatRetention(m.retention.d7)}`,
    `_▲▼ 전일 대비 · 가입자 줄은 서버 값(${serverBoundary(m.date)}시 경계) · 나머지는 GA4 운영 스트림(00시 경계)_`,
  ].join('\n');
}

/** 운영이 아니면 환경을 앞에 붙인다 — 두 메시지가 같은 규칙 */
const envPrefix = (environment?: string): string =>
  environment && environment !== 'production' ? `[${environment}] ` : '';

const weekday = (date: string): string =>
  WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** 서버 값의 하루 경계 — 보고 날짜(정오)에 적용되는 경계로 적는다. 05:00 전환(KAN-149) 전후를 가른다 */
const serverBoundary = (date: string): string =>
  String(serviceDayStartHour(new Date(`${date}T12:00:00+09:00`))).padStart(
    2,
    '0',
  );

export type ChurnMetrics = {
  /** 보고 대상 날짜 — 지표 보고와 같은 값(어제) */
  date: string;
  /** 탈퇴 — **서버 값**(`withdrawal_logs`). 사유 코드별 건수, `null` 은 사유 미선택 */
  withdrawals: { reasonCode: string | null; count: number }[];
  /** 앱 삭제 — GA4 `app_remove`(운영 스트림). Android 만 올라온다 */
  appRemoves: number;
};

/** 탈퇴 화면의 선택지 문구와 같다(`auth-uiux.md` 탈퇴 사유). 순서도 화면 순서 — 건수가 같을 때 이 순서로 놓는다 */
const REASON_LABEL: Record<WithdrawalReason, string> = {
  [WithdrawalReason.CONTENT_QUALITY]: '콘텐츠 품질이 기대에 못 미쳤어요',
  [WithdrawalReason.RECOMMENDATION_MISMATCH]:
    '제 관심사와 맞지 않는 콘텐츠가 왔어요',
  [WithdrawalReason.LOW_USAGE]: '들을 시간이 없거나 잘 안 쓰게 됐어요',
  [WithdrawalReason.PRICE]: '구독 가격이 부담됐어요',
  [WithdrawalReason.NOT_ENOUGH_CONTENT]: '듣고 싶은 주제 콘텐츠가 부족했어요',
  [WithdrawalReason.APP_ISSUE]: '앱 오류나 사용이 불편했어요',
  [WithdrawalReason.ALTERNATIVE]: '다른 서비스를 이용하게 됐어요',
  [WithdrawalReason.OTHER]: '기타',
};
const REASON_ORDER: readonly string[] = Object.keys(REASON_LABEL);

/** 모르는 코드는 원값을 그대로 쓴다 — 조용히 비는 것보다 낫다. 사유 미선택은 맨 뒤 */
function reasonLabel(code: string | null): string {
  if (code === null) return '사유 미선택';
  return REASON_LABEL[code as WithdrawalReason] ?? code;
}

function reasonRank(code: string | null): number {
  if (code === null) return Number.MAX_SAFE_INTEGER;
  const i = REASON_ORDER.indexOf(code);
  return i === -1 ? REASON_ORDER.length : i;
}

/**
 * 이탈 보고 — 탈퇴(서버, 사유 분포)와 앱 삭제(GA4, Android). 하루 범위는 지표 보고와 같다: 서버 값은
 * 서비스 날짜, GA4 는 00시. 탈퇴가 0이어도 보낸다 — "없었다"도 보고다.
 *
 * 사유는 건수 많은 순, 같으면 화면 순서. 직접 입력 사유 원문은 싣지 않는다(분포만 — 2026-10-15 결정).
 */
export function formatChurnReport(
  m: ChurnMetrics,
  environment?: string,
): string {
  const total = m.withdrawals.reduce((sum, w) => sum + w.count, 0);
  const reasons = [...m.withdrawals]
    .filter((w) => w.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        reasonRank(a.reasonCode) - reasonRank(b.reasonCode),
    )
    .map((w) => `    · ${reasonLabel(w.reasonCode)}  ${n(w.count)}`);
  return [
    `${envPrefix(environment)}:door: *${m.date} (${weekday(m.date)}) 이어 이탈*  ·  운영 스트림`,
    `*탈퇴*      ${n(total)}명`,
    ...reasons,
    `*앱 삭제*  Android ${n(m.appRemoves)}`,
    `_탈퇴는 서버 값(${serverBoundary(m.date)}시 경계) · 앱 삭제는 GA4 app_remove 운영 스트림(00시 경계) — iOS 는 삭제 이벤트가 없어 세지 않는다_`,
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
