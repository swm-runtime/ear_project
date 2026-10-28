/**
 * 서비스 지표 v2 탭(`GET /admin/insights/v2`)의 문구·상수·순수 함수 — 그리기와 분리해 테스트한다. 숫자 판정(성숙·가장 큰 이탈·강조 칸)은
 * 서버가 하고, 여기서는 사람이 읽는 말과 변경 기록 표시만 정한다.
 */
import type { EarBreakdownDimension, EarFunnelStepKey, EarSegmentKey } from "./ear";

/**
 * 변경 기록 — North Star 주간 막대와 코호트 표 행에 표시한다. **새 변경은 여기 한 줄 추가**(날짜는 KST `YYYY-MM-DD`).
 * 지표가 꺾인 주에 무엇이 바뀌었는지 같이 보려는 것이라, 사용자가 체감하는 변경(출시·발송·정책)만 적는다.
 */
export const CHANGE_LOG: readonly { date: string; label: string }[] = [
  { date: "2026-10-22", label: "1.3.0 출시" },
  { date: "2026-10-24", label: "글로벌 가입 열림" },
  { date: "2026-10-27", label: "저녁 리텐션 푸시 시작" },
  { date: "2026-10-27", label: "동남아 발송 그룹" },
];

/** `YYYY-MM-DD` 라벨에 n일 — 라벨 연산이라 시간대가 없다 */
export function addDaysLabel(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 그 서비스 주(월요일 `weekStart`부터 7일)에 든 변경 — 날짜 라벨 비교(05시 경계는 하루 단위 기록이라 무시한다) */
export function changesInWeek(weekStart: string, log: readonly { date: string; label: string }[] = CHANGE_LOG) {
  const end = addDaysLabel(weekStart, 7);
  return log.filter((c) => c.date >= weekStart && c.date < end);
}

/** 퍼널 단계 — 이름과 "다음에 고칠 곳". 순서는 서버 `steps` 순서를 따른다 */
export const STEP_META: Record<EarFunnelStepKey, { label: string; short: string; hint: string }> = {
  signups: { label: "가입", short: "가입", hint: "유입 — 광고 소재·스토어 리스팅" },
  onboarding_completed: { label: "온보딩 완료", short: "온보딩", hint: "로그인 → 온보딩 — 주제 선택·커리어 단계 수, 건너뛰기, 로그인 직후 첫 화면" },
  first_play_24h: { label: "24시간 안 첫 재생", short: "24h 재생", hint: "첫 드립 도착 전 첫 화면 — 온보딩 직후 바로 들을 한 편이 보이는가, 첫 드립이 늦지 않은가" },
  first_complete: { label: "첫 완청", short: "첫 완청", hint: "첫 편 선택과 앞부분 — 첫 추천 편의 주제·길이, 앞 30초 도입" },
  w1_return: { label: "W1 복귀 (가입 7~13일째)", short: "W1", hint: "둘째 주 복귀 — 리텐션 알림 대상·발송 시각, 주제 다양화" },
  habit_14d: { label: "14일 안 3일 이상 청취", short: "14일 습관", hint: "습관 — 드립 품질(매일 들을 만한 편이 오는가)·편성 시각" },
  paid_ever: { label: "결제", short: "결제", hint: "페이월 — 노출 시점·가격·체험 종료 안내" },
};

/** 안 듣는 세그먼트 — 이름·분모 설명·"할 수 있는 일" */
export const SEGMENT_META: Record<EarSegmentKey, { title: string; base: string; hint: string }> = {
  no_play: { title: "가입했는데 재생 0", base: "가입 1일 지난 사람", hint: "첫 드립 도착 전 화면 · 온보딩 마지막 단계 · 알림 권한 요청 시점" },
  no_complete: { title: "재생했는데 완청 0", base: "재생한 사람", hint: "첫 편 고르는 방식 · 앞부분 30초 · 편 길이" },
  lapsing: { title: "앞 7일엔 들었는데 최근 7일 0 (이탈 직전)", base: "앞 7일 청취자", hint: "리텐션 알림 대상에 넣기 · 주제 다양화 · 관심 주제 남은 편수 확인" },
};

export const DIMENSION_LABEL: Record<EarBreakdownDimension, string> = {
  market: "시장", push: "알림 권한", provider: "가입 경로", marketing: "마케팅 동의", onboarding: "온보딩",
};
const KEY_LABEL: Record<EarBreakdownDimension, Record<string, string>> = {
  market: { kr: "국내", global: "글로벌" },
  push: { yes: "알림 받을 수 있음", no: "알림 못 받음" },
  provider: { kakao: "카카오", google: "구글", apple: "애플", naver: "네이버" },
  marketing: { agreed: "마케팅 동의", not_agreed: "마케팅 미동의" },
  onboarding: { completed: "온보딩 완료", not_completed: "온보딩 미완료" },
};
export const breakdownLabel = (dimension: EarBreakdownDimension, key: string): string => KEY_LABEL[dimension][key] ?? key;

/** 비율 차이 `0.2` → `+20%p` */
export function fmtGap(gap: number | null | undefined): string {
  if (gap == null || Number.isNaN(gap)) return "-";
  const pp = Math.round(gap * 100);
  return `${pp > 0 ? "+" : ""}${pp}%p`;
}

/** 사람 수 증감 `5` → `+5명`, `-3` → `-3명`, `0` → `±0명` */
export const fmtDelta = (n: number): string => (n > 0 ? `+${n}명` : n < 0 ? `${n}명` : "±0명");
