import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  dismissContentReviewPrompt,
  fetchContentReview,
  fetchContentReviewPrompt,
  fetchPromotions,
  muteContentReviewPrompt,
  redeemPromotion,
  saveContentReview,
  toPromotion,
  toSaveContentReviewRequestDto,
} from './content-review.api';
import type { PromotionDto } from './content-review.dto';

// 실서버 경로의 변환을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../content-review.constants', () => ({
  ...jest.requireActual<object>('../content-review.constants'),
  IS_CONTENT_REVIEW_API_MOCKED: false,
}));
// 구독 조회 본문 변환만 쓴다 — 공개 API 의 결제 모듈 의존을 끌어오지 않는다
jest.mock('@/features/subscription', () =>
  jest.requireActual('@/features/subscription/api/subscription.api'),
);
jest.mock('@/features/auth', () => ({
  selectMarket: () => 'kr',
  useSessionStore: { getState: () => ({ user: null }) },
}));

const mockGet = jest.fn<(url: string) => Promise<{ data: unknown }>>();
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<{ data: unknown }>>();
const mockPut = jest.fn<(url: string, body?: unknown) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: {
    get: (url: string) => mockGet(url),
    post: (url: string, body?: unknown) => mockPost(url, body),
    put: (url: string, body?: unknown) => mockPut(url, body),
  },
}));

/** 계약 2.2 `promotion` 예시 그대로 */
const PROMOTION: PromotionDto = {
  id: 'p-1',
  kind: 'review_reward',
  name: '후기 참여',
  tier: 'pro',
  plan_name: 'Pro',
  grant_days: 7,
  issued_at: '2026-10-28T03:00:00Z',
  expires_at: '2027-01-27T20:00:00Z',
  last_usable_date: '2027-01-27',
  redeemable: true,
  reason: null,
  overlaps_trial: false,
  redeem_preview: { ends_at: '2026-11-03T20:00:00Z', last_date: '2026-11-03' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: undefined });
});

describe('content-review.api — 계약(content-review-api.md)', () => {
  it('4.1 시트 열기 — 경로에 편 id 를 싣고, 안 들은 편은 reviewable=false · reason 을 옮긴다', async () => {
    mockGet.mockResolvedValue({
      data: {
        enabled: true,
        reviewable: false,
        reason: 'not_played',
        review: null,
        reward_progress: { current: 1, required: 3 },
      },
    });
    const state = await fetchContentReview('c-1');
    expect(mockGet).toHaveBeenCalledWith('/contents/c-1/review');
    expect(state).toEqual({
      enabled: true,
      reviewable: false,
      reason: 'not_played',
      review: null,
      rewardProgress: { current: 1, required: 3 },
    });
  });

  it('4.1 — 스위치가 꺼지면 reviewable 을 믿지 않고 disabled 로 본다 · 모르는 사유는 unknown', async () => {
    mockGet.mockResolvedValueOnce({
      data: { enabled: false, reviewable: true, reason: null, review: null, reward_progress: null },
    });
    const off = await fetchContentReview('c-1');
    expect(off.reviewable).toBe(false);

    mockGet.mockResolvedValueOnce({
      data: { enabled: true, reviewable: false, reason: 'future', review: null, reward_progress: null },
    });
    expect((await fetchContentReview('c-1')).reason).toBe('unknown');
  });

  it('4.2 저장 — PUT 으로 보내고, 빈 글(공백만)은 null 로 보낸다 · 발급된 프로모션을 옮긴다', async () => {
    mockPut.mockResolvedValue({
      data: {
        review: {
          stars: 4,
          text: null,
          is_completed: true,
          content_version: 2,
          created_at: '2026-10-28T23:10:00Z',
          updated_at: '2026-10-28T23:10:00Z',
        },
        reward_progress: null,
        issued_promotion: PROMOTION,
      },
    });
    const saved = await saveContentReview({ contentId: 'c-1', stars: 4, text: '   ' });
    expect(mockPut).toHaveBeenCalledWith('/contents/c-1/review', { stars: 4, text: null });
    expect(saved.review).toEqual({ stars: 4, text: null, updatedAt: '2026-10-28T23:10:00Z' });
    expect(saved.rewardProgress).toBeNull();
    expect(saved.issuedPromotion?.name).toBe('후기 참여');
  });

  it('4.2 요청 — 글은 원문 그대로 보낸다(앞뒤 공백 정리는 서버 몫)', () => {
    expect(toSaveContentReviewRequestDto({ stars: 5, text: ' 좋았어요 ' })).toEqual({
      stars: 5,
      text: ' 좋았어요 ',
    });
  });

  it('4.3 먼저 묻기 — enabled 를 옮기고, 꺼져 있으면 show 를 믿지 않는다', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        enabled: true,
        show: true,
        item: {
          content_id: 'c-9',
          title: '관세는 외국이 내는 세금이 아니다',
          thumbnail_url: '',
          language: 'ko',
          completed_date: '2026-10-27',
        },
        reward_progress: { current: 2, required: 3 },
        muted_until: null,
      },
    });
    const prompt = await fetchContentReviewPrompt();
    expect(mockGet).toHaveBeenCalledWith('/users/me/content-review/prompt');
    expect(prompt).toEqual({
      enabled: true,
      show: true,
      item: { contentId: 'c-9', title: '관세는 외국이 내는 세금이 아니다', thumbnailUrl: null },
      rewardProgress: { current: 2, required: 3 },
    });

    mockGet.mockResolvedValueOnce({
      data: { enabled: false, show: true, item: null, reward_progress: null, muted_until: null },
    });
    expect((await fetchContentReviewPrompt()).show).toBe(false);
  });

  it('4.4 · 4.5 닫기 · 그만 보기 — 본문 없이 각 경로', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined });
    await dismissContentReviewPrompt();
    mockPost.mockResolvedValueOnce({ data: { muted_until: '2026-11-02' } });
    const muted = await muteContentReviewPrompt();
    expect(mockPost).toHaveBeenNthCalledWith(1, '/users/me/content-review/prompt/dismiss', undefined);
    expect(mockPost).toHaveBeenNthCalledWith(2, '/users/me/content-review/prompt/mute', undefined);
    expect(muted.mutedUntil).toBe('2026-11-02');
  });

  it('4.6 프로모션 화면 — 지급 · 목록 · 배지 · 진행을 옮기고, 모르는 kind 의 카드는 뺀다', async () => {
    mockGet.mockResolvedValue({
      data: {
        enabled: true,
        grant: {
          name: '후기 참여',
          tier: 'pro',
          plan_name: 'Pro',
          ends_at: '2026-11-03T20:00:00Z',
          last_date: '2026-11-03',
        },
        promotions: [
          { ...PROMOTION, redeemable: false, reason: 'pro_subscribed' },
          { ...PROMOTION, id: 'p-2', kind: 'future_kind' },
        ],
        has_unused: true,
        reward_progress: null,
      },
    });
    const overview = await fetchPromotions();
    expect(mockGet).toHaveBeenCalledWith('/users/me/promotions');
    expect(overview.grant?.lastDate).toBe('2026-11-03');
    expect(overview.hasUnused).toBe(true);
    expect(overview.promotions).toHaveLength(1);
    expect(overview.promotions[0]).toMatchObject({
      id: 'p-1',
      planName: 'Pro',
      grantDays: 7,
      lastUsableDate: '2027-01-27',
      redeemable: false,
      reason: 'pro_subscribed',
      redeemPreviewLastDate: '2026-11-03',
    });
  });

  it('2.2 — 쓸 수 있는 카드는 사유를 null 로, 모르는 사유는 unknown 으로 받는다', () => {
    expect(toPromotion({ ...PROMOTION, reason: 'leftover' })?.reason).toBeNull();
    expect(toPromotion({ ...PROMOTION, redeemable: false, reason: 'new_reason' })?.reason).toBe(
      'unknown',
    );
    expect(toPromotion({ ...PROMOTION, redeemable: false, reason: 'grant_active' })?.reason).toBe(
      'grant_active',
    );
  });

  it('4.7 사용 — 경로에 id 를 싣고, 응답은 구독 조회 본문으로 옮긴다', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        plan: {
          status: 'free',
          tier: 'pro',
          plan_name: 'Pro',
          daily_play_limit: null,
          renews_at: null,
          expires_at: null,
          has_payment_issue: false,
          grant: {
            name: '후기 참여',
            tier: 'pro',
            plan_name: 'Pro',
            ends_at: '2026-11-03T20:00:00Z',
            last_date: '2026-11-03',
          },
        },
        entitlements: {
          daily_play_limit: null,
          daily_drip_count: 2,
          drip_enabled: true,
          ads_enabled: false,
        },
        store: null,
        pending_plan: null,
      },
    });
    const subscription = await redeemPromotion('p-1');
    expect(mockPost).toHaveBeenCalledWith('/users/me/promotions/p-1/redeem', undefined);
    expect(subscription.plan.grant).toEqual({
      name: '후기 참여',
      tier: 'pro',
      planName: 'Pro',
      endsAt: '2026-11-03T20:00:00Z',
      lastDate: '2026-11-03',
    });
  });
});
