/**
 * content-review-api.md 의 요청 · 응답 그대로(snake_case). 변환은 content-review.api.ts 안에서만 한다(convention.md 1.6).
 */
import type { MySubscriptionResponseDto, PlanGrantDto } from '@/features/subscription';

/** 2.2 `review` — 내 후기 */
export interface ContentReviewDto {
  stars: number;
  /** 글이 없으면 null(빈 문자열은 오지 않는다) */
  text: string | null;
  is_completed: boolean;
  content_version: number;
  created_at: string;
  updated_at: string;
}

/** 2.2 `reward_progress` — null 이면 보상 줄을 그리지 않는다 */
export interface RewardProgressDto {
  current: number;
  required: number;
}

/** 2.2 `promotion` — 사용 가능한 프로모션 한 장(4.6 목록 · 4.2 발급 응답) */
export interface PromotionDto {
  id: string;
  /** 지금은 `review_reward` 하나. 모르는 값이면 카드를 그리지 않는다 */
  kind: string;
  name: string;
  tier: string;
  plan_name: string;
  grant_days: number;
  issued_at: string;
  expires_at: string;
  last_usable_date: string;
  redeemable: boolean;
  reason: string | null;
  overlaps_trial: boolean;
  redeem_preview: { ends_at: string; last_date: string };
}

/** 4.1 GET /contents/:contentId/review */
export interface ContentReviewStateResponseDto {
  enabled: boolean;
  reviewable: boolean;
  /** `disabled` · `withdrawn` · `not_played` — reviewable=true 면 null */
  reason: string | null;
  review: ContentReviewDto | null;
  reward_progress: RewardProgressDto | null;
}

/** 4.2 PUT /contents/:contentId/review */
export interface SaveContentReviewRequestDto {
  stars: number;
  /** 빈 값 · null = 글 없음(있던 글을 지운다) */
  text: string | null;
}

export interface SaveContentReviewResponseDto {
  review: ContentReviewDto;
  reward_progress: RewardProgressDto | null;
  issued_promotion: PromotionDto | null;
}

/** 4.3 GET /users/me/content-review/prompt */
export interface ContentReviewPromptItemDto {
  content_id: string;
  title: string;
  thumbnail_url: string | null;
  language: string;
  completed_date: string;
}

export interface ContentReviewPromptResponseDto {
  enabled: boolean;
  show: boolean;
  item: ContentReviewPromptItemDto | null;
  reward_progress: RewardProgressDto | null;
  muted_until: string | null;
}

/** 4.5 POST …/prompt/mute */
export interface MuteContentReviewPromptResponseDto {
  muted_until: string;
}

/** `plan.grant` — subscription-api.md 4.8 과 같은 모양 · 같은 값(초대 코드 지급이든 후기 참여든) */
export type PromotionGrantDto = PlanGrantDto;

/** 4.6 GET /users/me/promotions */
export interface PromotionsResponseDto {
  enabled: boolean;
  grant: PromotionGrantDto | null;
  promotions: PromotionDto[];
  has_unused: boolean;
  reward_progress: RewardProgressDto | null;
}

/** 4.7 POST /users/me/promotions/:promotionId/redeem — 응답은 구독 조회(subscription-api.md 4.2)와 같은 본문 */
export type RedeemPromotionResponseDto = MySubscriptionResponseDto;
