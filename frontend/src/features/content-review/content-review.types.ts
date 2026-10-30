import type { PlanGrant } from '@/features/subscription';

/** 내 후기(content-review-api.md 2.2 `review`) */
export interface ContentReview {
  stars: number;
  /** 글이 없으면 null */
  text: string | null;
  updatedAt: string;
}

/** 발급까지의 진행 — null 이면 보상 줄을 그리지 않는다(이미 받음 · 발급 스위치 꺼짐 · 후기 스위치 꺼짐). 앱은 다른 조건을 따지지 않는다 */
export interface RewardProgress {
  current: number;
  required: number;
}

/** 쓸 수 없는 사유 — 서버 판정 그대로. 모르는 값은 `unknown` 으로 받아 흐린 버튼만 그린다 */
export type PromotionUnusableReason = 'pro_subscribed' | 'grant_active' | 'unknown';

/** 사용 가능한 프로모션 한 장(2.2 `promotion`) */
export interface Promotion {
  id: string;
  kind: 'review_reward';
  /** 표시 이름 — KR "후기 참여" · GLOBAL "Review"(서버 상수). "{name} 프로모션" 의 재료 */
  name: string;
  planName: string;
  grantDays: number;
  /** 쓸 수 있는 마지막 서비스 날짜(YYYY-MM-DD) — "{N월 N일}까지 사용" 은 이 값 그대로 */
  lastUsableDate: string;
  redeemable: boolean;
  reason: PromotionUnusableReason | null;
  /** 지금 가입 체험 중 — 확인 팝업에 한 줄을 더한다 */
  overlapsTrial: boolean;
  /** 지금 쓰면 끝나는 마지막 서비스 날짜 — 확인 팝업의 "{N월 N일}까지" */
  redeemPreviewLastDate: string;
}

/** 후기를 쓸 수 없는 사유(4.1 `reason`) */
export type ContentReviewUnavailableReason = 'disabled' | 'withdrawn' | 'not_played' | 'unknown';

/** 후기 시트를 열 때 받는 상태(4.1) */
export interface ContentReviewState {
  enabled: boolean;
  reviewable: boolean;
  reason: ContentReviewUnavailableReason | null;
  review: ContentReview | null;
  rewardProgress: RewardProgress | null;
}

/** 저장 결과(4.2) */
export interface SavedContentReview {
  review: ContentReview;
  rewardProgress: RewardProgress | null;
  /** 이번 저장으로 발급된 프로모션 — 있으면 발급 안내 시트(L19) */
  issuedPromotion: Promotion | null;
}

/** 후기를 남길 편 — 시트 상단 요약에 그린다 */
export interface ContentReviewTarget {
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
}

/** 먼저 묻기 판정(4.3) */
export interface ContentReviewPrompt {
  enabled: boolean;
  show: boolean;
  item: ContentReviewTarget | null;
  rewardProgress: RewardProgress | null;
}

/** S12 프로모션 화면(4.6) */
export interface PromotionsOverview {
  enabled: boolean;
  /** 이용 중 지급 — 초대 코드 · 후기 참여 공통(`plan.grant`) */
  grant: PlanGrant | null;
  promotions: Promotion[];
  /** 설정 [프로모션] 행의 점 배지 */
  hasUnused: boolean;
  /** "아직 받지 않았을 때" 섹션 — null 이면 그리지 않는다 */
  rewardProgress: RewardProgress | null;
}
