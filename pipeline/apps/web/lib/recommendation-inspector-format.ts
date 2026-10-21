/**
 * 서비스 지표 "추천 검증" 보기의 표시 포맷 — 순수 함수만 둔다(그리기와 분리해 테스트한다). 점수·판정은 서버가 다 계산하고
 * (`GET /admin/insights/recommendations/users/:userId`), 여기서는 사람이 읽는 문자열과 표의 칸으로만 바꾼다.
 */

/** 점수(0~1) — 소수 셋째 자리. null 은 "입력이 없어 축·항목에서 빠짐"이라 `-` */
export function fmtScore(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "-" : n.toFixed(3);
}

/** 가중치 — 0.35 → `0.35` */
export const fmtWeight = (n: number): string => (Math.round(n * 1000) / 1000).toString();

export type AxisKey = "embedding" | "signal" | "meta";
export const AXIS_LABEL: Record<AxisKey, string> = { embedding: "임베딩", signal: "신호", meta: "메타" };

export interface AxisContribution {
  axis: AxisKey;
  score: number | null;
  /** 상수 가중치 */
  weight: number;
  /** 빠진 축을 뺀 나머지로 다시 나눈 실효 가중치 — 축이 빠졌으면 0 */
  effectiveWeight: number;
  /** score × 실효 가중치. 셋을 더하면 정규 편성 최종 점수다 */
  contribution: number;
}

/**
 * 정규 편성 최종 점수 = 있는 축만의 가중 평균(서버 `weightedMean` — drip-scheduling 4.2 재정규화). 축별로 얼마를 밀었는지
 * 보이려고 실효 가중치와 기여분을 펼친다. 탐험 편은 점수식이 달라(저노출·품질 항목) 이 분해를 쓰지 않는다.
 */
export function axisContributions(
  breakdown: Record<AxisKey, number | null>,
  weights: Record<AxisKey, number>,
): AxisContribution[] {
  const axes: AxisKey[] = ["embedding", "signal", "meta"];
  const present = axes.filter((a) => breakdown[a] != null).reduce((sum, a) => sum + weights[a], 0);
  return axes.map((axis) => {
    const score = breakdown[axis];
    const effectiveWeight = score == null || present === 0 ? 0 : weights[axis] / present;
    return { axis, score, weight: weights[axis], effectiveWeight, contribution: score == null ? 0 : score * effectiveWeight };
  });
}

/** `{ a: 2, b: 1 }` → `a 2 · b 1`(많은 순). 라벨이 있으면 바꿔 적는다 */
export function fmtCounts(counts: Record<string, number>, labels: Record<string, string> = {}): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.length === 0 ? "없음" : entries.map(([k, n]) => `${labels[k] ?? k} ${n}`).join(" · ");
}

export const INTEREST_SOURCE_LABEL: Record<string, string> = { onboarding: "온보딩", manual: "직접 추가", auto_expand: "자동 확장" };
export const DELIVERY_SOURCE_LABEL: Record<string, string> = { drip: "정규", discovery: "탐험" };
export const LIBRARY_STATUS_LABEL: Record<string, string> = { unplayed: "안 들음", in_progress: "듣는 중", completed: "완청" };
export const SIGNAL_ACTION_LABEL: Record<string, string> = {
  play: "재생", complete: "완청", save: "담기", unsave: "담기 해제", delete: "삭제", replay: "재청취", ignore: "무시(7일 미청취)",
};
export const SKIP_REASON_LABEL: Record<string, string> = {
  no_interests: "관심 주제 없음", already_placed: "오늘 이미 편성됨", unfinished_inventory: "미청취 재고 많음", plan_disabled: "플랜 편수 0",
};
export const EXCLUDED_REASON_LABEL: Record<string, string> = {
  episode_order: "시리즈 순서", user_removed_topic: "직접 해제한 주제", below_quality_floor: "품질 하한 미달",
};
export const AUTO_EXPAND_ACTION_LABEL: Record<string, string> = { none: "변화 없음", add: "추가", replace: "교체", expire: "만료" };
export const AUTO_EXPAND_REASON_LABEL: Record<string, string> = {
  no_candidate: "후보 없음", slot_free: "빈 자동 슬롯", slot_kept: "현재 슬롯 유지", stronger_candidate: "더 강한 후보",
  slot_expired: "슬롯 만료", disabled: "사용자가 끔", feature_off: "서버 스위치 꺼짐",
};

/** 별점 — 없으면 `-` */
export const fmtStars = (n: number | null): string => (n == null ? "-" : `${"★".repeat(n)}${"☆".repeat(Math.max(0, 5 - n))}`);
