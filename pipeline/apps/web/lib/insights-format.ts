/**
 * 서비스 지표 탭의 표시 포맷 — 순수 함수만 둔다(그리기와 분리해 테스트한다). 숫자는 서버(admin-api 4.22)가 다 세고,
 * 여기서는 사람이 읽는 문자열로만 바꾼다.
 */

/** 청취 시간 — `42초` · `12분` · `3시간 5분` · 100시간 넘으면 분을 버리고 `1,234시간` */
export function fmtListenSec(sec: number | null | undefined): string {
  if (sec == null) return "-";
  const s = Math.round(sec);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h >= 100) return `${h.toLocaleString("ko-KR")}시간`;
  return m % 60 === 0 ? `${h}시간` : `${h}시간 ${m % 60}분`;
}

/** 비율 — null(분모 0)은 `-`, 아니면 소수 한 자리 퍼센트 */
export function fmtPct(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || Number.isNaN(ratio)) return "-";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export const fmtInt = (n: number | null | undefined): string => (n == null ? "-" : n.toLocaleString("ko-KR"));

/** 날짜 라벨 `YYYY-MM-DD` → `MM-DD` */
export const shortDate = (date: string): string => date.slice(5);

/** ISO 시각 → KST 월·일(`10. 08.`) — 가입일·마지막 재생처럼 날짜만 필요한 칸 */
export function fmtKstDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
}

/** uuid 의 앞 8자 — 사람이 식별·대조하는 데는 충분하고, 표가 넓어지지 않는다 */
export const shortId = (id: string): string => id.slice(0, 8);

export const TIER_LABEL: Record<string, string> = { light: "무료", daily: "데일리", pro: "프로", trial: "체험" };
export const PROVIDER_LABEL: Record<string, string> = { kakao: "카카오", google: "구글", apple: "애플", naver: "네이버" };
/** `withdrawal_logs.reason_code` — 값은 auth-api 9장 계약 그대로(`content_quailty`는 문서에 확정된 오타) */
export const REASON_LABEL: Record<string, string> = {
  content_quailty: "콘텐츠 품질", recommendation_mismatch: "관심사와 안 맞음", low_usage: "잘 안 쓰게 됨", price: "가격 부담",
  not_enough_content: "주제 콘텐츠 부족", app_issue: "앱 오류·불편", alternative: "다른 서비스", other: "기타",
};
export const labelOf = (map: Record<string, string>, key: string | null | undefined, fallback = "미선택"): string =>
  key == null ? fallback : map[key] ?? key;

/** 막대 높이용 최댓값 — 전부 0 이어도 1 로 두어 0 나누기를 피한다 */
export const maxOf = <T,>(rows: T[], pick: (row: T) => number): number => Math.max(1, ...rows.map(pick));

/** 표본이 작을 때 비율 옆에 붙이는 주의 — 30 미만이면 비율로 읽지 말라는 뜻(검색 로그 탭과 같은 문턱) */
export const SMALL_SAMPLE = 30;
export const isSmall = (n: number): boolean => n > 0 && n < SMALL_SAMPLE;
