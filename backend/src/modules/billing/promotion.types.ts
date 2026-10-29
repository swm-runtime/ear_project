import {
  ContentReviewView,
  RewardProgressView,
} from '@/modules/content-review/content-review.types';
import { PromotionKind } from '@/modules/content-review/content-review.enum';
import { InviteGrantView } from '@/modules/subscription/subscription.types';
import { UserTier } from '@/modules/user/user.enum';

import { PromotionUnusableReason } from './promotion.policy';

/** 사용 가능한 프로모션 한 장(`content-review-api.md` 2.2 `promotion`) */
export interface PromotionView {
  id: string;
  kind: PromotionKind;
  /** 사용자 시장의 언어 — KR "후기 참여" · GLOBAL "Review" */
  name: string;
  tier: UserTier;
  planName: string;
  grantDays: number;
  issuedAt: Date;
  expiresAt: Date;
  /** 쓸 수 있는 마지막 서비스 날짜 */
  lastUsableDate: string;
  redeemable: boolean;
  reason: PromotionUnusableReason | null;
  /** 지금 가입 체험 중인가 */
  overlapsTrial: boolean;
  /** 지금 쓰면 끝나는 시각(배타) · 마지막 서비스 날짜 */
  redeemPreview: { endsAt: Date; lastDate: string };
}

/** 4.2 — 후기 저장 응답(발급 프로모션은 구독 상태로 조립한다) */
export interface SaveContentReviewView {
  review: ContentReviewView;
  rewardProgress: RewardProgressView | null;
  issuedPromotion: PromotionView | null;
}

/** 4.6 — S12 [프로모션] */
export interface PromotionScreenView {
  enabled: boolean;
  grant: InviteGrantView | null;
  promotions: PromotionView[];
  hasUnused: boolean;
  rewardProgress: RewardProgressView | null;
}
