import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import {
  mockDismissContentReviewPrompt,
  mockFetchContentReview,
  mockFetchContentReviewPrompt,
  mockFetchPromotions,
  mockRedeemPromotion,
  mockSaveContentReview,
  resetContentReviewMockForTest,
} from './content-review.mock';

const mockMarket = { value: 'kr' as 'kr' | 'global' };
jest.mock('@/features/auth', () => ({
  selectMarket: () => mockMarket.value,
  useSessionStore: { getState: () => ({ user: null }) },
}));

/** mock 의 네트워크 지연(400ms)을 가짜 시계로 건너뛴다 */
const run = async <T>(call: () => Promise<T>): Promise<T> => {
  const promise = call();
  // 거부도 잡아 둔다 — 시계를 넘기는 동안 처리되지 않은 거부로 잡히지 않게
  promise.catch(() => undefined);
  await jest.advanceTimersByTimeAsync(500);
  return promise;
};

const errorCodeOf = async (call: () => Promise<unknown>): Promise<string | null> => {
  try {
    await run(call);
    return null;
  } catch (error) {
    return isApiError(error) ? error.errorCode : 'not-api-error';
  }
};

const LONG_TEXT = '비유가 쉬워서 출근길에 듣기 좋았어요';

beforeEach(() => {
  jest.useFakeTimers();
  mockMarket.value = 'kr';
});
afterEach(() => {
  jest.useRealTimers();
});

describe('content-review.mock — 시나리오(KAN-280 요청 7)', () => {
  it('발급 직전(almost) — 진행 2/3 에서 끝까지 들은 편에 별 + 글 10자 이상을 보내면 발급되고, 보상 줄이 사라진다', async () => {
    resetContentReviewMockForTest('almost');
    const before = await run(() => mockFetchContentReview('c-1'));
    expect(before.reward_progress).toEqual({ current: 2, required: 3 });

    const saved = await run(() => mockSaveContentReview('c-1', { stars: 4, text: LONG_TEXT }));
    expect(saved.issued_promotion?.name).toBe('후기 참여');
    expect(saved.reward_progress).toBeNull();

    const promotions = await run(() => mockFetchPromotions());
    expect(promotions.has_unused).toBe(true);
    expect(promotions.promotions).toHaveLength(1);
    expect(promotions.reward_progress).toBeNull();
  });

  it('발급 직전 — 별점만(글 없음) 남긴 후기는 셈에 들어가지 않는다', async () => {
    resetContentReviewMockForTest('almost');
    const saved = await run(() => mockSaveContentReview('c-1', { stars: 5, text: null }));
    expect(saved.issued_promotion).toBeNull();
    expect(saved.reward_progress).toEqual({ current: 2, required: 3 });
  });

  it('기본(default) — 저장하면 다시 열 때 내 후기가 채워져 있다', async () => {
    resetContentReviewMockForTest('default');
    await run(() => mockSaveContentReview('c-1', { stars: 3, text: '  ' }));
    const state = await run(() => mockFetchContentReview('c-1'));
    expect(state.review?.stars).toBe(3);
    expect(state.review?.text).toBeNull();
  });

  it('발급됨(issued) — 사용하면 지급(grant)이 생기고 목록에서 사라진다 · 두 번째 사용은 이미 사용함', async () => {
    resetContentReviewMockForTest('issued');
    const list = await run(() => mockFetchPromotions());
    const id = list.promotions[0]?.id ?? '';
    expect(list.promotions[0]?.redeemable).toBe(true);

    const subscription = await run(() => mockRedeemPromotion(id));
    expect(subscription.plan.grant).toMatchObject({ name: '후기 참여', last_date: '2026-11-04' });

    const after = await run(() => mockFetchPromotions());
    expect(after.promotions).toHaveLength(0);
    expect(after.has_unused).toBe(false);
    expect(after.grant?.name).toBe('후기 참여');
    expect(await errorCodeOf(() => mockRedeemPromotion(id))).toBe(
      ERROR_CODES.PROMOTION_ALREADY_USED,
    );
  });

  it('Pro 구독 중(pro) — 흐린 카드(pro_subscribed)이고 사용은 PROMOTION_PRO_SUBSCRIBED', async () => {
    resetContentReviewMockForTest('pro');
    const list = await run(() => mockFetchPromotions());
    expect(list.promotions[0]).toMatchObject({ redeemable: false, reason: 'pro_subscribed' });
    expect(list.has_unused).toBe(true);
    expect(await errorCodeOf(() => mockRedeemPromotion(list.promotions[0]?.id ?? ''))).toBe(
      ERROR_CODES.PROMOTION_PRO_SUBSCRIBED,
    );
  });

  it('다른 프로모션 이용 중(grant_active) — 이용 중 지급이 보이고 사용은 INVITE_GRANT_ALREADY_ACTIVE', async () => {
    resetContentReviewMockForTest('grant_active');
    const list = await run(() => mockFetchPromotions());
    expect(list.grant?.name).toBe('가을 이벤트');
    expect(list.promotions[0]).toMatchObject({ redeemable: false, reason: 'grant_active' });
    expect(await errorCodeOf(() => mockRedeemPromotion(list.promotions[0]?.id ?? ''))).toBe(
      ERROR_CODES.INVITE_GRANT_ALREADY_ACTIVE,
    );
  });

  it('체험 중(trial) — 쓸 수 있고 overlaps_trial 이 켜진다', async () => {
    resetContentReviewMockForTest('trial');
    const list = await run(() => mockFetchPromotions());
    expect(list.promotions[0]).toMatchObject({ redeemable: true, overlaps_trial: true });
  });

  it('스위치 꺼짐(disabled) — 모든 응답 enabled=false · 저장 거부 · 프로모션 화면은 열린다', async () => {
    resetContentReviewMockForTest('disabled');
    const prompt = await run(() => mockFetchContentReviewPrompt());
    expect(prompt).toMatchObject({ enabled: false, show: false });
    const state = await run(() => mockFetchContentReview('c-1'));
    expect(state).toMatchObject({ enabled: false, reviewable: false, reason: 'disabled' });
    expect(await errorCodeOf(() => mockSaveContentReview('c-1', { stars: 4, text: null }))).toBe(
      ERROR_CODES.CONTENT_REVIEW_DISABLED,
    );
    const list = await run(() => mockFetchPromotions());
    expect(list.enabled).toBe(false);
  });

  it('안 들은 편(not_played) — 시트 열기는 not_played, 저장은 CONTENT_REVIEW_NOT_PLAYED', async () => {
    resetContentReviewMockForTest('not_played');
    const state = await run(() => mockFetchContentReview('c-1'));
    expect(state).toMatchObject({ reviewable: false, reason: 'not_played' });
    expect(await errorCodeOf(() => mockSaveContentReview('c-1', { stars: 4, text: null }))).toBe(
      ERROR_CODES.CONTENT_REVIEW_NOT_PLAYED,
    );
  });

  it('먼저 묻기 — 처음엔 show=true, 닫으면(dismiss) 그 뒤로 show=false', async () => {
    resetContentReviewMockForTest('default');
    expect((await run(() => mockFetchContentReviewPrompt())).show).toBe(true);
    await run(() => mockDismissContentReviewPrompt());
    expect((await run(() => mockFetchContentReviewPrompt())).show).toBe(false);
  });

  it('GLOBAL 계정 — 프로모션 이름이 Review 다', async () => {
    mockMarket.value = 'global';
    resetContentReviewMockForTest('issued');
    const list = await run(() => mockFetchPromotions());
    expect(list.promotions[0]?.name).toBe('Review');
  });
});
