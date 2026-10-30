import { ERROR_CODES } from '@/shared/api/error-codes';

import { CONTENT_REVIEW_COPY } from '../content-review.copy';
import type { ContentReviewState, ContentReviewUnavailableReason } from '../content-review.types';
import type { ContentReviewSendOutcome } from '../services/content-review.service';

/**
 * [보내기] 결과 → 토스트(content-review.md 5장 · library-uiux.md 4.13). null 이면 띄우지 않는다.
 * - 저장 · 보관(망 단절 — 다음 기회에 다시 보낸다) → "후기 고마워요"
 * - 안 들은 편 → "들어 본 편에만 후기를 남길 수 있어요" · 회수 · 없는 편 → "이 편에는 후기를 남길 수 없어요"
 * - 기능 꺼짐 → 조용히(시트를 닫고 [후기]를 숨긴다)
 * - 그 밖의 실패 → 시트가 열려 있으면 인라인 에러라 토스트가 없다. 이미 닫았으면 "보내지 못했어요"
 */
export const reviewOutcomeToast = (
  outcome: ContentReviewSendOutcome,
  isSheetOpen: boolean,
): string | null => {
  switch (outcome.kind) {
    case 'sent':
    case 'queued':
      return CONTENT_REVIEW_COPY.toast.thanks;
    case 'discarded':
      if (outcome.errorCode === ERROR_CODES.CONTENT_REVIEW_NOT_PLAYED) {
        return CONTENT_REVIEW_COPY.toast.notPlayed;
      }
      if (outcome.errorCode === ERROR_CODES.CONTENT_REVIEW_DISABLED) return null;
      return CONTENT_REVIEW_COPY.toast.unavailable;
    case 'failed':
      return isSheetOpen ? null : CONTENT_REVIEW_COPY.sheet.sendFailed;
  }
};

/** 시트 대신 띄우는 안내 — 꺼짐이면 아무것도 띄우지 않는다(진입점이 사라질 뿐이다) */
export const unavailableToast = (reason: ContentReviewUnavailableReason | null): string | null => {
  if (reason === 'disabled') return null;
  if (reason === 'not_played') return CONTENT_REVIEW_COPY.toast.notPlayed;
  return CONTENT_REVIEW_COPY.toast.unavailable;
};

/** 저장 뒤 상세 "내 후기" · 다시 연 시트가 볼 상태 — 응답 값으로 캐시를 바로 맞춘다(다시 묻지 않는다) */
export const reviewStateAfterSave = (
  outcome: Extract<ContentReviewSendOutcome, { kind: 'sent' }>,
): ContentReviewState => ({
  enabled: true,
  reviewable: true,
  reason: null,
  review: outcome.saved.review,
  // 이번에 발급됐으면 서버가 null 을 준다 — 보상 줄도 사라진다
  rewardProgress: outcome.saved.rewardProgress,
});
