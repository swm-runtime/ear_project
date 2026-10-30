import { apiClient } from '@/shared/api/api-client';

import { toMySubscription, toPlanGrant, type MySubscription } from '@/features/subscription';

import { IS_CONTENT_REVIEW_API_MOCKED } from '../content-review.constants';
import type {
  ContentReview,
  ContentReviewPrompt,
  ContentReviewState,
  ContentReviewUnavailableReason,
  Promotion,
  PromotionsOverview,
  PromotionUnusableReason,
  RewardProgress,
  SavedContentReview,
} from '../content-review.types';
import type {
  ContentReviewDto,
  ContentReviewPromptResponseDto,
  ContentReviewStateResponseDto,
  MuteContentReviewPromptResponseDto,
  PromotionDto,
  PromotionsResponseDto,
  RedeemPromotionResponseDto,
  RewardProgressDto,
  SaveContentReviewRequestDto,
  SaveContentReviewResponseDto,
} from './content-review.dto';
import {
  mockDismissContentReviewPrompt,
  mockFetchContentReview,
  mockFetchContentReviewPrompt,
  mockFetchPromotions,
  mockMuteContentReviewPrompt,
  mockRedeemPromotion,
  mockSaveContentReview,
} from './content-review.mock';

/*
 * 콘텐츠 후기 · 후기 참여 프로모션의 호출(content-review-api.md — KAN-279). 판정은 전부 서버다 — 이 모듈은 계약을 옮길 뿐이다.
 * 멱등키는 없다(2장): 후기는 (user_id, content_id) upsert, 닫기 · 그만 보기는 절대값 저장, 사용은 행 잠금으로 한 번만 지급된다.
 */

/** react-query 키 — 후기 상태(콘텐츠 상세 "내 후기"와 시트가 같은 캐시) · 프로모션 화면(S12 와 설정 배지가 같은 캐시) */
export const contentReviewKeys = {
  all: ['content-review'] as const,
  review: (contentId: string) => ['content-review', 'review', contentId] as const,
  promotions: () => ['content-review', 'promotions'] as const,
};

/* ── 변환 — snake_case ↔ camelCase 는 이 모듈 안에서만(convention.md 1.6) ── */

const toContentReview = (dto: ContentReviewDto): ContentReview => ({
  stars: dto.stars,
  text: dto.text === '' ? null : dto.text,
  updatedAt: dto.updated_at,
});

const toRewardProgress = (dto: RewardProgressDto | null): RewardProgress | null =>
  dto === null ? null : { current: dto.current, required: dto.required };

const UNAVAILABLE_REASONS: readonly ContentReviewUnavailableReason[] = [
  'disabled',
  'withdrawn',
  'not_played',
];

const toUnavailableReason = (value: string | null): ContentReviewUnavailableReason | null => {
  if (value === null) return null;
  return UNAVAILABLE_REASONS.find((reason) => reason === value) ?? 'unknown';
};

const toUnusableReason = (value: string | null): PromotionUnusableReason | null => {
  if (value === null) return null;
  if (value === 'pro_subscribed' || value === 'grant_active') return value;
  return 'unknown';
};

/** 모르는 `kind`면 null — 카드를 그리지 않는다(2.2) */
export const toPromotion = (dto: PromotionDto): Promotion | null => {
  if (dto.kind !== 'review_reward') return null;
  return {
    id: dto.id,
    kind: dto.kind,
    name: dto.name,
    planName: dto.plan_name,
    grantDays: dto.grant_days,
    lastUsableDate: dto.last_usable_date,
    // 흐린 버튼 · 사유는 서버 값 그대로 — 사유가 없는 false 도 흐리게만 그린다
    redeemable: dto.redeemable,
    reason: dto.redeemable ? null : toUnusableReason(dto.reason),
    overlapsTrial: dto.overlaps_trial,
    redeemPreviewLastDate: dto.redeem_preview.last_date,
  };
};

export const toContentReviewState = (dto: ContentReviewStateResponseDto): ContentReviewState => ({
  enabled: dto.enabled,
  reviewable: dto.enabled && dto.reviewable,
  reason: dto.reviewable
    ? null
    : toUnavailableReason(dto.reason ?? (dto.enabled ? null : 'disabled')),
  review: dto.review === null ? null : toContentReview(dto.review),
  rewardProgress: toRewardProgress(dto.reward_progress),
});

export const toSavedContentReview = (dto: SaveContentReviewResponseDto): SavedContentReview => ({
  review: toContentReview(dto.review),
  rewardProgress: toRewardProgress(dto.reward_progress),
  issuedPromotion: dto.issued_promotion === null ? null : toPromotion(dto.issued_promotion),
});

export const toContentReviewPrompt = (
  dto: ContentReviewPromptResponseDto,
): ContentReviewPrompt => ({
  enabled: dto.enabled,
  // 꺼져 있으면 show 를 믿지 않는다 — 서버도 false 로 주지만 두 값이 어긋나면 그리지 않는 쪽이 안전하다
  show: dto.enabled && dto.show && dto.item !== null,
  item:
    dto.item === null
      ? null
      : {
          contentId: dto.item.content_id,
          title: dto.item.title,
          thumbnailUrl: dto.item.thumbnail_url === '' ? null : dto.item.thumbnail_url,
        },
  rewardProgress: toRewardProgress(dto.reward_progress),
});

export const toPromotionsOverview = (dto: PromotionsResponseDto): PromotionsOverview => {
  const promotions = dto.promotions.flatMap((item) => {
    const mapped = toPromotion(item);
    return mapped === null ? [] : [mapped];
  });
  return {
    enabled: dto.enabled,
    grant: toPlanGrant(dto.grant),
    promotions,
    hasUnused: dto.has_unused,
    rewardProgress: toRewardProgress(dto.reward_progress),
  };
};

/** 4.2 요청 — 앞뒤 공백은 서버가 빼지만 빈 글은 null 로 보낸다(글 없음 = 있던 글을 지운다) */
export const toSaveContentReviewRequestDto = (input: {
  stars: number;
  text: string;
}): SaveContentReviewRequestDto => ({
  stars: input.stars,
  text: input.text.trim().length > 0 ? input.text : null,
});

/* ── 엔드포인트 — mock 분기는 각 함수 진입점 한 곳에서만 한다 ── */

const reviewPath = (contentId: string): string =>
  `/contents/${encodeURIComponent(contentId)}/review`;
const PROMPT_PATH = '/users/me/content-review/prompt';
const PROMOTIONS_PATH = '/users/me/promotions';

/** 4.1 후기 시트 열기 — 쓸 수 있는지 · 내 후기 · 발급까지의 진행 */
export const fetchContentReview = async (contentId: string): Promise<ContentReviewState> => {
  const data = IS_CONTENT_REVIEW_API_MOCKED
    ? await mockFetchContentReview(contentId)
    : (await apiClient.get<ContentReviewStateResponseDto>(reviewPath(contentId))).data;
  return toContentReviewState(data);
};

/** 4.2 후기 저장 — 덮어쓰기. 응답의 `issued_promotion`이 있으면 발급 안내 시트를 띄운다 */
export const saveContentReview = async (input: {
  contentId: string;
  stars: number;
  text: string;
}): Promise<SavedContentReview> => {
  const body = toSaveContentReviewRequestDto(input);
  const data = IS_CONTENT_REVIEW_API_MOCKED
    ? await mockSaveContentReview(input.contentId, body)
    : (await apiClient.put<SaveContentReviewResponseDto>(reviewPath(input.contentId), body)).data;
  return toSavedContentReview(data);
};

/** 4.3 먼저 묻기 판정 + 켜짐 여부 — 라이브러리 진입 시. 상태를 바꾸지 않는다 */
export const fetchContentReviewPrompt = async (): Promise<ContentReviewPrompt> => {
  const data = IS_CONTENT_REVIEW_API_MOCKED
    ? await mockFetchContentReviewPrompt()
    : (await apiClient.get<ContentReviewPromptResponseDto>(PROMPT_PATH)).data;
  return toContentReviewPrompt(data);
};

/** 4.4 먼저 묻는 시트를 닫음 — 닫든 보내든 시트가 닫힐 때 한 번 */
export const dismissContentReviewPrompt = async (): Promise<void> => {
  if (IS_CONTENT_REVIEW_API_MOCKED) {
    await mockDismissContentReviewPrompt();
    return;
  }
  await apiClient.post(`${PROMPT_PATH}/dismiss`);
};

/** 4.5 이번 주 그만 보기 — "물었다"도 함께 적으므로 dismiss 를 따로 부르지 않는다 */
export const muteContentReviewPrompt = async (): Promise<{ mutedUntil: string }> => {
  const data: MuteContentReviewPromptResponseDto = IS_CONTENT_REVIEW_API_MOCKED
    ? await mockMuteContentReviewPrompt()
    : (await apiClient.post<MuteContentReviewPromptResponseDto>(`${PROMPT_PATH}/mute`)).data;
  return { mutedUntil: data.muted_until };
};

/** 4.6 S12 프로모션 화면 · 설정 [프로모션] 행의 점 배지 */
export const fetchPromotions = async (): Promise<PromotionsOverview> => {
  const data = IS_CONTENT_REVIEW_API_MOCKED
    ? await mockFetchPromotions()
    : (await apiClient.get<PromotionsResponseDto>(PROMOTIONS_PATH)).data;
  return toPromotionsOverview(data);
};

/**
 * 4.7 프로모션 사용 — 응답은 구독 조회와 같은 본문이라 앱이 구독 조회를 다시 부르지 않는다.
 * **오프라인 큐에 넣지 않는다**(6장 — 지급 시작일이 보낸 날로 정해진다)
 */
export const redeemPromotion = async (promotionId: string): Promise<MySubscription> => {
  const data: RedeemPromotionResponseDto = IS_CONTENT_REVIEW_API_MOCKED
    ? await mockRedeemPromotion(promotionId)
    : (
        await apiClient.post<RedeemPromotionResponseDto>(
          `${PROMOTIONS_PATH}/${encodeURIComponent(promotionId)}/redeem`,
        )
      ).data;
  return toMySubscription(data);
};
