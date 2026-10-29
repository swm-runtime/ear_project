import { describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { Promotion } from '../content-review.types';
import { reviewOutcomeToast, reviewStateAfterSave, unavailableToast } from './review-outcome';
import { promotionReasonLine, redeemConfirmMessage, redeemErrorAction } from './usePromotionsScreen';
import type { ContentReviewSendOutcome } from '../services/content-review.service';

jest.mock('@/features/subscription', () => ({
  formatPlanGrantLine: jest.fn(),
  grantStartedMessage: jest.fn(),
  inviteSuccessMessage: jest.fn(),
  notifySubscriptionChanged: jest.fn(),
  subscriptionKeys: { me: () => ['subscription', 'me'] },
}));
jest.mock('@/features/auth', () => ({
  selectMarket: () => 'kr',
  useSessionStore: { getState: () => ({ user: null }) },
}));

const PROMOTION: Promotion = {
  id: 'p-1',
  kind: 'review_reward',
  name: '후기 참여',
  planName: 'Pro',
  grantDays: 7,
  lastUsableDate: '2027-01-27',
  redeemable: true,
  reason: null,
  overlapsTrial: false,
  redeemPreviewLastDate: '2026-11-03',
};

const apiError = (errorCode: string) => new ApiError(errorCode, 'x', false, null, null, 409);

describe('S12 프로모션 — 쓸 수 없음의 사유 줄(서버 사유 그대로)', () => {
  it('pro_subscribed — 요금제 이름은 프로모션의 plan_name 을 쓴다(티어 이름을 박지 않는다)', () => {
    expect(promotionReasonLine('pro_subscribed', 'Pro')).toBe(
      'Pro 구독 중에는 쓸 수 없어요. 구독이 끝난 뒤 쓸 수 있어요',
    );
  });

  it('grant_active · 모르는 사유 · 사유 없음', () => {
    expect(promotionReasonLine('grant_active', 'Pro')).toBe(
      '이용 중인 프로모션이 끝난 뒤 쓸 수 있어요',
    );
    expect(promotionReasonLine('unknown', 'Pro')).toBe('지금은 쓸 수 없어요');
    expect(promotionReasonLine(null, 'Pro')).toBeNull();
  });
});

describe('S13 사용 확인 — 끝나는 날짜는 서버의 redeem_preview, 체험 중이면 한 줄 더', () => {
  it('무료 계정', () => {
    expect(redeemConfirmMessage(PROMOTION)).toBe('오늘부터 Pro 7일 · 11월 3일까지');
  });

  it('가입 체험 중', () => {
    expect(redeemConfirmMessage({ ...PROMOTION, overlapsTrial: true })).toBe(
      '오늘부터 Pro 7일 · 11월 3일까지\n\n체험 중엔 재생 한도가 이미 풀려 있어요. 체험이 끝난 뒤 쓰면 더 오래 누릴 수 있어요',
    );
  });
});

describe('사용 실패 처리(content-review-api.md 5장)', () => {
  it('이미 사용함 — 다시 받아 지급이 보이면 성공으로 그린다(문구 없음)', () => {
    expect(redeemErrorAction(apiError(ERROR_CODES.PROMOTION_ALREADY_USED), 'Pro')).toEqual({
      reload: true,
      message: null,
      checkUsed: true,
    });
  });

  it('기한 지남 · Pro 구독 중 · 다른 지급 이용 중은 문구 + 다시 받기', () => {
    expect(redeemErrorAction(apiError(ERROR_CODES.PROMOTION_EXPIRED), 'Pro').message).toBe(
      '사용 기한이 지난 프로모션이에요',
    );
    expect(redeemErrorAction(apiError(ERROR_CODES.PROMOTION_PRO_SUBSCRIBED), 'Pro')).toMatchObject({
      reload: true,
      message: 'Pro 구독 중에는 쓸 수 없어요. 구독이 끝난 뒤 쓸 수 있어요',
    });
    expect(redeemErrorAction(apiError(ERROR_CODES.INVITE_GRANT_ALREADY_ACTIVE), 'Pro')).toMatchObject(
      { reload: true, message: '이용 중인 프로모션이 끝난 뒤 쓸 수 있어요' },
    );
  });

  it('없는 프로모션은 조용히 다시 받고, 망 단절은 다시 받지 않고 문구만', () => {
    expect(redeemErrorAction(apiError(ERROR_CODES.PROMOTION_NOT_FOUND), 'Pro')).toEqual({
      reload: true,
      message: null,
      checkUsed: false,
    });
    expect(redeemErrorAction(apiError(ERROR_CODES.NETWORK_ERROR), 'Pro')).toEqual({
      reload: false,
      message: '네트워크 연결을 확인해주세요',
      checkUsed: false,
    });
  });
});

describe('후기 결과 → 토스트(content-review.md 5장)', () => {
  const SENT: Extract<ContentReviewSendOutcome, { kind: 'sent' }> = {
    kind: 'sent',
    saved: {
      review: { stars: 4, text: null, updatedAt: '2026-10-29T00:00:00Z' },
      rewardProgress: null,
      issuedPromotion: null,
    },
  };

  it('저장 · 보관(망 단절)은 "후기 고마워요"', () => {
    expect(reviewOutcomeToast(SENT, true)).toBe('후기 고마워요');
    expect(reviewOutcomeToast({ kind: 'queued' }, true)).toBe('후기 고마워요');
  });

  it('안 들은 편은 안내, 꺼짐은 조용히, 회수는 "남길 수 없어요"', () => {
    expect(
      reviewOutcomeToast({ kind: 'discarded', errorCode: ERROR_CODES.CONTENT_REVIEW_NOT_PLAYED }, true),
    ).toBe('들어 본 편에만 후기를 남길 수 있어요');
    expect(
      reviewOutcomeToast({ kind: 'discarded', errorCode: ERROR_CODES.CONTENT_REVIEW_DISABLED }, true),
    ).toBeNull();
    expect(
      reviewOutcomeToast({ kind: 'discarded', errorCode: ERROR_CODES.CONTENT_WITHDRAWN }, true),
    ).toBe('이 편에는 후기를 남길 수 없어요');
  });

  it('실패는 시트가 열려 있으면 인라인(토스트 없음), 이미 닫았으면 토스트', () => {
    expect(reviewOutcomeToast({ kind: 'failed' }, true)).toBeNull();
    expect(reviewOutcomeToast({ kind: 'failed' }, false)).toBe('보내지 못했어요. 다시 시도해주세요');
  });

  it('시트 대신 안내 — 안 들은 편 · 그 밖, 꺼짐은 없음', () => {
    expect(unavailableToast('not_played')).toBe('들어 본 편에만 후기를 남길 수 있어요');
    expect(unavailableToast('withdrawn')).toBe('이 편에는 후기를 남길 수 없어요');
    expect(unavailableToast('disabled')).toBeNull();
  });

  it('저장 뒤 상태 — 다시 열면 내 후기가 채워지고 [수정하기]가 된다(발급됐으면 보상 줄이 사라진다)', () => {
    const state = reviewStateAfterSave(SENT);
    expect(state.review?.stars).toBe(4);
    expect(state.reviewable).toBe(true);
    expect(state.rewardProgress).toBeNull();
  });
});
