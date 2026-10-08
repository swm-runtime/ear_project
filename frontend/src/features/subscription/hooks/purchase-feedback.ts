import { IS_DEV_API } from '@/shared/lib/app-version';

import type {
  PurchaseFailure,
  PurchaseOutcome,
  RestoreOutcome,
} from '../services/purchase.service';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { PlanAction } from '../subscription.types';

/**
 * 결제·복원 결과 → 화면 반응. 판정 없이 서버·스토어가 준 결과를 문구로 옮기기만 한다 —
 * 순수 함수라 화면 없이 검증한다(convention.md 7.2).
 */
export interface PurchaseFeedback {
  /** 토스트 — 되돌릴 필요 없는 결과 통지 */
  toast: string | null;
  /** 인라인 안내 — 시트·화면에 남는다(결제 실패 등) */
  notice: { message: string; tone: 'info' | 'error' } | null;
  /** 요금제 목록을 다시 받는다(SUBSCRIPTION_PLAN_UNAVAILABLE) */
  shouldRefetchPlans: boolean;
}

const NONE: PurchaseFeedback = { toast: null, notice: null, shouldRefetchPlans: false };

export const failureMessage = (reason: PurchaseFailure): string => {
  switch (reason) {
    case 'planUnavailable':
      return SUBSCRIPTION_COPY.error.planUnavailable;
    case 'storeMismatch':
      return SUBSCRIPTION_COPY.error.storeMismatch;
    case 'receiptInvalid':
      return SUBSCRIPTION_COPY.error.receiptInvalid;
    case 'ownedByAnotherAccount':
      return SUBSCRIPTION_COPY.error.ownedByAnotherAccount;
    case 'alreadySubscribed':
      return SUBSCRIPTION_COPY.error.alreadySubscribed;
    case 'replaceSourceMissing':
      return SUBSCRIPTION_COPY.error.replaceSourceMissing;
    case 'downgradeNeedsUpdate':
      return SUBSCRIPTION_COPY.error.downgradeNeedsUpdate;
    case 'changeRejected':
      return SUBSCRIPTION_COPY.error.changeRejected;
    case 'storeUnavailable':
      return SUBSCRIPTION_COPY.error.storeUnavailable;
    case 'network':
      return SUBSCRIPTION_COPY.error.network;
    case 'unknown':
      return SUBSCRIPTION_COPY.error.unknown;
  }
};

export const toPurchaseFeedback = (
  outcome: PurchaseOutcome,
  action: PlanAction,
): PurchaseFeedback => {
  switch (outcome.kind) {
    case 'success': {
      const pending = outcome.subscription.pendingPlan;
      // 다운그레이드는 즉시 바뀌지 않는다 — 서버의 pending_plan 날짜로 안내한다(subscription.md 4.4)
      if (pending !== null && action === 'downgrade') {
        return {
          ...NONE,
          toast: SUBSCRIPTION_COPY.status.pendingPlan(pending.effectiveAt, pending.planName),
        };
      }
      return {
        ...NONE,
        toast:
          action === 'upgrade'
            ? SUBSCRIPTION_COPY.result.upgraded
            : SUBSCRIPTION_COPY.result.purchased,
      };
    }
    // 결제 시트를 닫은 것 — 원래 화면 그대로, 문구 없음(subscription-api.md 5장)
    case 'cancelled':
    case 'busy':
    case 'emailRequired':
      return NONE;
    case 'pending':
      return { ...NONE, notice: { message: SUBSCRIPTION_COPY.result.pending, tone: 'info' } };
    case 'alreadyOwned':
      return { ...NONE, notice: { message: SUBSCRIPTION_COPY.result.alreadyOwned, tone: 'info' } };
    case 'delayed':
      return { ...NONE, notice: { message: SUBSCRIPTION_COPY.result.delayed, tone: 'info' } };
    case 'failed':
      return {
        toast: null,
        notice: {
          // 개발계 앱에는 스토어 실패 원문을 덧붙인다 — 테스트하는 사람이 로그 없이 원인을 본다(KAN-158)
          message:
            IS_DEV_API && outcome.detail
              ? `${failureMessage(outcome.reason)}\n(${outcome.detail})`
              : failureMessage(outcome.reason),
          tone: 'error',
        },
        shouldRefetchPlans: outcome.reason === 'planUnavailable',
      };
  }
};

export const toRestoreFeedback = (outcome: RestoreOutcome): PurchaseFeedback => {
  switch (outcome.kind) {
    case 'restored':
      return { ...NONE, toast: SUBSCRIPTION_COPY.result.restored };
    case 'nothingToRestore':
      return { ...NONE, toast: SUBSCRIPTION_COPY.result.nothingToRestore };
    case 'busy':
      return NONE;
    case 'failed':
      return { ...NONE, notice: { message: failureMessage(outcome.reason), tone: 'error' } };
  }
};
