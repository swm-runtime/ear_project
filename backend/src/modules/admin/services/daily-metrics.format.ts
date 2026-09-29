/**
 * 일일 지표 Slack 문구 — **순수 함수만 둔다.** GA4 호출은 `ga4.service.ts` 가 하고,
 * 여기서는 받은 숫자를 사람이 읽는 줄로 바꾼다. 그래야 자격 없이도 검증된다.
 */

export type DailyMetrics = {
  /** 보고 대상 날짜 (`YYYY-MM-DD`, KST) */
  date: string;
  activeUsers: number;
  newUsers: number;
  signUps: number;
  /** 코호트 리텐션 — 표본이 없으면 null(0 과 다르다: "아직 모른다") */
  retention: { d1: number | null; d7: number | null };
};

const pct = (v: number | null): string =>
  v === null ? '—' : `${(v * 100).toFixed(1)}%`;

/** `1234` → `1,234` — 천 단위 구분자만. 로케일에 맡기면 서버 TZ·ICU 에 따라 흔들린다 */
const n = (v: number): string => v.toLocaleString('en-US');

/**
 * 하루치 보고 한 덩어리.
 *
 * 리텐션이 `null` 이면 `—` 로 적는다 — **0% 와 구분해야 한다.** 코호트가 비어 있는 것과
 * 아무도 돌아오지 않은 것은 전혀 다른 사실이고, 0% 로 적으면 지표를 잘못 읽는다.
 */
export function formatDailyMetrics(
  m: DailyMetrics,
  environment?: string,
): string {
  const prefix =
    environment && environment !== 'production' ? `[${environment}] ` : '';
  return [
    `${prefix}:bar_chart: *${m.date} 지표*`,
    `• 활성 사용자 ${n(m.activeUsers)}명 · 신규 ${n(m.newUsers)}명 · 가입 ${n(m.signUps)}건`,
    `• 리텐션 D1 ${pct(m.retention.d1)} · D7 ${pct(m.retention.d7)}`,
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
