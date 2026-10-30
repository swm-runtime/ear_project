import { ContentLanguage, ContentStatus } from '@/modules/content/content.enum';
import { UserMarket } from '@/modules/user/user.enum';

import { ContentReviewUnreviewableReason } from './content-review.enum';

/** 내 후기(`content-review-api.md` 2.2 `review`) */
export interface ContentReviewView {
  stars: number;
  /** 앞뒤 공백을 뺀 글. 글이 없으면 `null` */
  text: string | null;
  isCompleted: boolean;
  contentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 발급까지의 진행(2.2 `reward_progress`). 보상 줄을 그리지 않을 때는 이 객체 대신 `null`이다 */
export interface RewardProgressView {
  current: number;
  required: number;
}

/** 4.1 — 후기 시트 열기 */
export interface ContentReviewSheetView {
  enabled: boolean;
  reviewable: boolean;
  reason: ContentReviewUnreviewableReason | null;
  review: ContentReviewView | null;
  rewardProgress: RewardProgressView | null;
}

export interface SaveContentReviewCommand {
  userId: string;
  contentId: string;
  market: UserMarket;
  stars: number;
  /** 정규화 전 입력 — 서비스가 앞뒤 공백을 뺀다 */
  text: string | null | undefined;
  now: Date;
}

/** 4.3 먼저 묻는 편 */
export interface ContentReviewPromptItemView {
  contentId: string;
  title: string;
  thumbnailUrl: string;
  language: ContentLanguage;
  /** 끝까지 들은 서비스 날짜 — 표시 보조, 판정 아님 */
  completedDate: string;
}

/** 4.3 — 먼저 묻기 판정 + 켜짐 여부 */
export interface ContentReviewPromptView {
  enabled: boolean;
  show: boolean;
  item: ContentReviewPromptItemView | null;
  rewardProgress: RewardProgressView | null;
  mutedUntil: string | null;
}

/** 먼저 묻는 편 후보 — Repository 조회 결과 */
export interface ContentReviewPromptCandidate {
  contentId: string;
  title: string;
  thumbnailUrl: string;
  language: ContentLanguage;
  completedAt: Date;
}

/** 저장 대상 행 — upsert 가 그 시점 값으로 덮어쓴다 */
export type ContentReviewDraft = {
  userId: string;
  contentId: string;
  stars: number;
  text: string | null;
  isCompleted: boolean;
  contentVersion: number;
  market: UserMarket;
};

// --- 관리자 (4.8 · 4.9) ---

export type StarDistribution = Record<'1' | '2' | '3' | '4' | '5', number>;

export interface AdminContentReviewSummaryFilter {
  contentId: string | null;
  /** 편의 시장 */
  market: UserMarket | null;
}

export interface AdminContentReviewVersionSummary {
  contentVersion: number;
  reviews: number;
  averageStars: number | null;
}

export interface AdminContentReviewItemSummary {
  contentId: string;
  title: string;
  market: UserMarket;
  status: ContentStatus;
  contentVersion: number;
  reviews: number;
  /** 별점 합 — 전체 평균을 가중 평균으로 내려고 둔다(응답에는 싣지 않는다) */
  starsSum: number;
  averageStars: number | null;
  distribution: StarDistribution;
  textReviews: number;
  completedReviews: number;
  lastReviewedAt: Date;
  byVersion: AdminContentReviewVersionSummary[];
}

/** 후기 참여 프로모션 건수(4.8 `promotions`) */
export interface AdminPromotionCounts {
  issued: number;
  redeemed: number;
  expired: number;
  unused: number;
}

export interface AdminContentReviewSummary {
  totals: {
    reviews: number;
    averageStars: number | null;
    textReviews: number;
    reviewedContents: number;
  };
  promotions: AdminPromotionCounts;
  items: AdminContentReviewItemSummary[];
}

export interface AdminContentReviewListFilter {
  contentId: string | null;
  /** 후기를 쓴(고친) 때의 사용자 시장 */
  market: UserMarket | null;
  hasText: boolean | null;
}

/** 글 목록 keyset 위치 — `updated_at`은 마이크로초까지 담은 ISO 문자열(밀리초 `Date`로 자르면 같은 ms 행이 빠진다) */
export interface AdminContentReviewCursorPosition {
  updatedAt: string;
  id: string;
}

/** 글 목록 한 줄 — **작성자(`user_id`)를 담지 않는다**(4.9 · `content-review.md` 4.7) */
export interface AdminContentReviewRow {
  id: string;
  contentId: string;
  contentTitle: string;
  contentStatus: ContentStatus;
  stars: number;
  text: string | null;
  isCompleted: boolean;
  contentVersion: number;
  market: UserMarket;
  createdAt: Date;
  updatedAt: Date;
  /** 커서용 — 마이크로초 정밀도 */
  updatedAtExact: string;
}

export interface AdminContentReviewPage {
  items: AdminContentReviewRow[];
  next: AdminContentReviewCursorPosition | null;
}
