/**
 * 콘텐츠 후기 · 후기 참여 프로모션 API mock(content-review-api.md — KAN-280 요청 7).
 * 스위치는 `IS_CONTENT_REVIEW_API_MOCKED`(`EXPO_PUBLIC_CONTENT_REVIEW_API=real`이면 실서버).
 *
 * 시나리오(`EXPO_PUBLIC_CONTENT_REVIEW_MOCK_SCENARIO`) — 응답 모양은 계약의 JSON 예시 그대로다.
 * - (기본) `default`  후기 기능 켜짐 · 진행 1/3 · 프로모션 없음 · 먼저 묻기 show=true
 * - `almost`        발급 직전 — 진행 2/3. 끝까지 들은 편에 별 + 글 10자 이상을 보내면 3/3 이 되어 프로모션이 발급된다
 * - `issued`        발급됨 — 쓰지 않은 프로모션 1장(사용 가능) · 보상 줄 없음
 * - `pro`           Pro 구독 중 — 프로모션은 있지만 쓸 수 없다(`pro_subscribed`), 사용하면 `PROMOTION_PRO_SUBSCRIBED`
 * - `grant_active`  다른 프로모션(초대 코드) 이용 중 — 쓸 수 없다(`grant_active`), 사용하면 `INVITE_GRANT_ALREADY_ACTIVE`
 * - `trial`         가입 체험 중 — 쓸 수 있고 확인 팝업에 체험 안내 줄이 더해진다(`overlaps_trial`)
 * - `disabled`      스위치 꺼짐 — 모든 응답 `enabled=false` · 저장은 `CONTENT_REVIEW_DISABLED`. 프로모션 화면은 열린다
 * - `not_played`    안 들은 편 — 시트를 열면 `reviewable=false`(`not_played`) · 저장은 `CONTENT_REVIEW_NOT_PLAYED`
 *
 * 추천 별점 mock 도 기본으로 팝업을 띄운다 — 같은 세션에는 추천 별점이 먼저라 먼저 묻는 시트(L18)를 보려면
 * `EXPO_PUBLIC_DRIP_FEEDBACK_MOCK_SCENARIO=hidden`을 함께 켠다.
 * 상태(내 후기 · 진행 · 발급 · 사용 · 먼저 묻기 응답)는 서버처럼 기억하고, 앱 리로드 시 초기화된다.
 * 날짜는 고정 라벨이다 — 표시 확인용이고 판정에 쓰지 않는다.
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import { selectMarket, useSessionStore } from '@/features/auth';
import type { MySubscriptionResponseDto } from '@/features/subscription';

import type {
  ContentReviewDto,
  ContentReviewPromptResponseDto,
  ContentReviewStateResponseDto,
  MuteContentReviewPromptResponseDto,
  PromotionDto,
  PromotionGrantDto,
  PromotionsResponseDto,
  RedeemPromotionResponseDto,
  RewardProgressDto,
  SaveContentReviewRequestDto,
  SaveContentReviewResponseDto,
} from './content-review.dto';

export type ContentReviewMockScenario =
  'default' | 'almost' | 'issued' | 'pro' | 'grant_active' | 'trial' | 'disabled' | 'not_played';

const SCENARIOS: readonly ContentReviewMockScenario[] = [
  'default',
  'almost',
  'issued',
  'pro',
  'grant_active',
  'trial',
  'disabled',
  'not_played',
];

const readScenario = (): ContentReviewMockScenario => {
  const value = process.env.EXPO_PUBLIC_CONTENT_REVIEW_MOCK_SCENARIO;
  return SCENARIOS.find((scenario) => scenario === value) ?? 'default';
};

/** 라이브러리 mock 과 같은 정도의 네트워크 지연 */
const RESPONSE_DELAY_MS = 400;
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 서버 상수(CONTENT_REVIEW_REWARD_REQUIRED · MIN_TEXT) 대역 — 앱 코드는 이 값을 모른다 */
const MOCK_REWARD_REQUIRED = 3;
const MOCK_REWARD_MIN_TEXT = 10;

const MOCK_PROMPT_CONTENT_ID = 'mock-content-review-prompt';

/** 표시 이름 — 서버 상수(KR "후기 참여" · GLOBAL "Review")의 대역. 사용자 시장의 언어다 */
const promotionName = (): string =>
  selectMarket(useSessionStore.getState()) === 'global' ? 'Review' : '후기 참여';

const MOCK_INVITE_GRANT: PromotionGrantDto = {
  name: '가을 이벤트',
  tier: 'pro',
  plan_name: 'Pro',
  ends_at: '2026-11-10T20:00:00Z',
  last_date: '2026-11-10',
};

/* ── mock 서버 상태 ── */

interface MockState {
  scenario: ContentReviewMockScenario;
  reviews: Map<string, ContentReviewDto>;
  /** 보상으로 친 편 — 서로 다른 편만 센다(4.4) */
  countedContentIds: Set<string>;
  /** 진행의 출발값(시나리오) — 앞서 쓴 후기들의 대역 */
  baseCount: number;
  /** 받은 적 있는가 — 계정당 전체 1회 */
  hasIssued: boolean;
  promotionUsed: boolean;
  grant: PromotionGrantDto | null;
  promptAnswered: boolean;
}

const createState = (scenario: ContentReviewMockScenario): MockState => {
  const hasPromotion =
    scenario === 'issued' ||
    scenario === 'pro' ||
    scenario === 'grant_active' ||
    scenario === 'trial';
  return {
    scenario,
    reviews: new Map(),
    countedContentIds: new Set(),
    baseCount: scenario === 'almost' ? 2 : hasPromotion ? MOCK_REWARD_REQUIRED : 1,
    hasIssued: hasPromotion,
    promotionUsed: false,
    grant: scenario === 'grant_active' ? MOCK_INVITE_GRANT : null,
    promptAnswered: false,
  };
};

let state: MockState = createState(readScenario());

/** 테스트 전용 — 시나리오를 바꿔 처음부터 */
export const resetContentReviewMockForTest = (
  scenario: ContentReviewMockScenario = 'default',
): void => {
  state = createState(scenario);
};

const isEnabled = (): boolean => state.scenario !== 'disabled';

const rewardProgress = (): RewardProgressDto | null => {
  if (!isEnabled() || state.hasIssued) return null;
  return {
    current: Math.min(MOCK_REWARD_REQUIRED, state.baseCount + state.countedContentIds.size),
    required: MOCK_REWARD_REQUIRED,
  };
};

const promotion = (): PromotionDto => {
  const reason =
    state.scenario === 'pro' ? 'pro_subscribed' : state.grant !== null ? 'grant_active' : null;
  return {
    id: 'mock-promotion-review-reward',
    kind: 'review_reward',
    name: promotionName(),
    tier: 'pro',
    plan_name: 'Pro',
    grant_days: 7,
    issued_at: '2026-10-28T03:00:00Z',
    expires_at: '2027-01-27T20:00:00Z',
    last_usable_date: '2027-01-27',
    redeemable: reason === null,
    reason,
    overlaps_trial: state.scenario === 'trial',
    redeem_preview: { ends_at: '2026-11-04T20:00:00Z', last_date: '2026-11-04' },
  };
};

const reject = (errorCode: string, message: string, httpStatus: number): never => {
  throw new ApiError(errorCode, message, false, null, null, httpStatus);
};

/* ── 엔드포인트 ── */

export const mockFetchContentReview = async (
  contentId: string,
): Promise<ContentReviewStateResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const review = state.reviews.get(contentId) ?? null;
  if (!isEnabled()) {
    return { enabled: false, reviewable: false, reason: 'disabled', review, reward_progress: null };
  }
  if (state.scenario === 'not_played' && contentId !== MOCK_PROMPT_CONTENT_ID) {
    return {
      enabled: true,
      reviewable: false,
      reason: 'not_played',
      review,
      reward_progress: rewardProgress(),
    };
  }
  return {
    enabled: true,
    reviewable: true,
    reason: null,
    review,
    reward_progress: rewardProgress(),
  };
};

export const mockSaveContentReview = async (
  contentId: string,
  body: SaveContentReviewRequestDto,
): Promise<SaveContentReviewResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (!Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) {
    reject(ERROR_CODES.VALIDATION_FAILED, '별점을 확인해주세요', 400);
  }
  if (!isEnabled()) reject(ERROR_CODES.CONTENT_REVIEW_DISABLED, '후기 기능이 꺼져 있어요', 409);
  if (state.scenario === 'not_played' && contentId !== MOCK_PROMPT_CONTENT_ID) {
    reject(ERROR_CODES.CONTENT_REVIEW_NOT_PLAYED, '들어 본 편에만 후기를 남길 수 있어요', 409);
  }
  const text = body.text?.trim() ?? '';
  const now = new Date().toISOString();
  const previous = state.reviews.get(contentId);
  const review: ContentReviewDto = {
    stars: body.stars,
    text: text.length > 0 ? text : null,
    // mock 의 편은 모두 끝까지 들은 것으로 본다 — 완청 판정은 서버 몫이다
    is_completed: true,
    content_version: 1,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
  state.reviews.set(contentId, review);

  let issued: PromotionDto | null = null;
  if (!state.hasIssued && text.length >= MOCK_REWARD_MIN_TEXT) {
    state.countedContentIds.add(contentId);
    if (state.baseCount + state.countedContentIds.size >= MOCK_REWARD_REQUIRED) {
      state.hasIssued = true;
      issued = { ...promotion(), issued_at: now };
    }
  }
  return {
    review,
    reward_progress: issued !== null ? null : rewardProgress(),
    issued_promotion: issued,
  };
};

export const mockFetchContentReviewPrompt = async (): Promise<ContentReviewPromptResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  if (!isEnabled()) {
    return { enabled: false, show: false, item: null, reward_progress: null, muted_until: null };
  }
  if (state.promptAnswered || state.reviews.has(MOCK_PROMPT_CONTENT_ID)) {
    return {
      enabled: true,
      show: false,
      item: null,
      reward_progress: rewardProgress(),
      muted_until: null,
    };
  }
  return {
    enabled: true,
    show: true,
    item: {
      content_id: MOCK_PROMPT_CONTENT_ID,
      title: '관세는 외국이 내는 세금이 아니다',
      thumbnail_url: 'https://picsum.photos/seed/mock-content-review/200',
      language: 'ko',
      completed_date: '2026-10-27',
    },
    reward_progress: rewardProgress(),
    muted_until: null,
  };
};

export const mockDismissContentReviewPrompt = async (): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
  state.promptAnswered = true;
};

export const mockMuteContentReviewPrompt =
  async (): Promise<MuteContentReviewPromptResponseDto> => {
    await delay(RESPONSE_DELAY_MS);
    state.promptAnswered = true;
    return { muted_until: '2026-11-02' };
  };

export const mockFetchPromotions = async (): Promise<PromotionsResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const promotions = state.hasIssued && !state.promotionUsed ? [promotion()] : [];
  return {
    enabled: isEnabled(),
    grant: state.grant,
    promotions,
    has_unused: promotions.length > 0,
    reward_progress: rewardProgress(),
  };
};

/** 무료 계정이 지급을 받은 뒤의 구독 조회 본문(subscription-api.md 4.2) */
const grantedSubscription = (grant: PromotionGrantDto): MySubscriptionResponseDto => ({
  plan: {
    status: 'free',
    tier: 'pro',
    plan_name: 'Pro',
    daily_play_limit: null,
    renews_at: null,
    expires_at: null,
    has_payment_issue: false,
    grant,
  },
  entitlements: {
    daily_play_limit: null,
    daily_drip_count: 2,
    drip_enabled: true,
    ads_enabled: false,
  },
  store: null,
  pending_plan: null,
});

export const mockRedeemPromotion = async (
  promotionId: string,
): Promise<RedeemPromotionResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  const current = promotion();
  if (!state.hasIssued || promotionId !== current.id) {
    reject(ERROR_CODES.PROMOTION_NOT_FOUND, '없는 프로모션이에요', 404);
  }
  if (state.promotionUsed)
    reject(ERROR_CODES.PROMOTION_ALREADY_USED, '이미 사용한 프로모션이에요', 409);
  if (current.reason === 'pro_subscribed') {
    reject(ERROR_CODES.PROMOTION_PRO_SUBSCRIBED, 'Pro 구독 중에는 쓸 수 없어요', 409);
  }
  if (current.reason === 'grant_active') {
    reject(ERROR_CODES.INVITE_GRANT_ALREADY_ACTIVE, '다른 지급이 이용 중이에요', 409);
  }
  state.promotionUsed = true;
  state.grant = {
    name: current.name,
    tier: current.tier,
    plan_name: current.plan_name,
    ends_at: current.redeem_preview.ends_at,
    last_date: current.redeem_preview.last_date,
  };
  return grantedSubscription(state.grant);
};
