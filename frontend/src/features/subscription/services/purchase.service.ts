/**
 * 구독 결제 서비스 — 결제 의도 → 스토어 결제 → 서버 제출 → (iOS) 거래 종료의 순서를 소유한다(subscription-api.md 6장).
 * React 밖 싱글턴이고 화면 상태는 subscription-purchase.store 로만 내보낸다(architecture.md 5장의 서비스 규칙).
 *
 * 지키는 것(KAN-120 "반드시 지켜야 하는 것"):
 * 1. 결제에 account_token 을 싣는다 — iOS appAccountToken · Android obfuscatedAccountId(어댑터)
 * 2. **서버가 200 을 준 뒤에만 거래를 끝낸다**(iOS finish). 실패·503 이면 거래를 그대로 둔다
 * 3. Android 의 구매 확인(acknowledge)은 하지 않는다 — 서버가 한다(어댑터의 finish 가 Android 에서 아무것도 안 한다)
 * 4. 시작·포그라운드 복귀 때 미완료 거래를 intent_id 없이 제출한다 — 결제 직후 앱이 죽은 경우의 회복 경로
 * 5. iOS 는 StoreKit 2 서명 거래(JWS)를 보낸다(어댑터의 token)
 * 6. 이메일 인증 관문 — 결제 의도가 EMAIL_REQUIRED_FOR_PURCHASE 면 결제 시트를 열지 않는다
 */
import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { logger } from '@/shared/lib/logger';

import type { SubmittedTransaction } from '../api/subscription.api';
import { RESTORE_MAX_ITEMS, SUBMIT_RETRY_DELAYS_MS } from '../subscription.constants';
import type {
  MySubscription,
  Plan,
  PurchaseEntryPoint,
  PurchaseIntent,
  PurchasePlatform,
} from '../subscription.types';
import {
  StoreError,
  toStoreError,
  type IapAdapter,
  type StoreProduct,
  type StorePurchase,
} from './iap-adapter';

/** 화면이 그리는 진행 단계 — 결제 진행 중에는 버튼 비활성·시트 닫기 차단(paywall.md 5장) */
export type PurchasePhase = 'idle' | 'purchasing' | 'verifying' | 'restoring';

export interface PurchaseUiState {
  phase: PurchasePhase;
  /** 서버 반영이 미뤄진 거래가 있다(503·네트워크) — "구독을 확인하고 있어요" 안내의 근거 */
  isVerificationDelayed: boolean;
}

/** 화면이 문구를 고르는 실패 사유 — 서버 error_code 와 스토어 실패를 한 줄로 접는다 */
export type PurchaseFailure =
  | 'planUnavailable'
  | 'storeMismatch'
  | 'receiptInvalid'
  | 'ownedByAnotherAccount'
  | 'storeUnavailable'
  | 'network'
  | 'unknown';

export type PurchaseOutcome =
  | { kind: 'success'; subscription: MySubscription }
  /** 사용자가 결제 시트를 닫았다 — 서버 호출도 문구도 없다 */
  | { kind: 'cancelled' }
  /** 결제 대기(iOS 승인 요청 등) — 승인되면 미완료 거래로 들어와 자동 제출된다 */
  | { kind: 'pending' }
  /** 스토어가 "이미 구독 중"이라고 답했다 — 복원을 안내한다 */
  | { kind: 'alreadyOwned' }
  /** 인증된 이메일이 없다 — 이메일 등록·인증 화면을 먼저 연다(auth.md 4.4) */
  | { kind: 'emailRequired' }
  /** 결제는 됐고 서버 반영만 늦다(503·네트워크) — 거래를 유지한 채 재시도 중 */
  | { kind: 'delayed' }
  | { kind: 'failed'; reason: PurchaseFailure }
  /** 다른 결제·복원이 진행 중이다 — 연타 */
  | { kind: 'busy' };

export type RestoreOutcome =
  | { kind: 'restored'; subscription: MySubscription }
  | { kind: 'nothingToRestore'; subscription: MySubscription }
  | { kind: 'failed'; reason: PurchaseFailure }
  | { kind: 'busy' };

export interface PurchaseServiceDeps {
  platform: PurchasePlatform;
  adapter: IapAdapter;
  api: {
    createIntent(input: {
      planId: string;
      platform: PurchasePlatform;
      entryPoint: PurchaseEntryPoint;
    }): Promise<PurchaseIntent>;
    submit(input: {
      transaction: SubmittedTransaction;
      intentId: string | null;
    }): Promise<MySubscription>;
    restore(input: {
      platform: PurchasePlatform;
      transactions: SubmittedTransaction[];
    }): Promise<{ restored: boolean; subscription: MySubscription }>;
  };
  /** 서버가 확정한 구독 본문 — 캐시 갱신·다른 feature 통지(화면은 이 값으로 확정한다, 다시 조회하지 않는다) */
  onSubscriptionChanged(subscription: MySubscription): void;
  /** 화면 밖(미완료 거래·재시도)에서 반영이 끝났다 — 사용자에게 알린다 */
  onRecovered(subscription: MySubscription): void;
  setUiState(patch: Partial<PurchaseUiState>): void;
  /** 타이머 — 테스트가 가짜로 바꾼다. 반환값은 취소 함수 */
  schedule(callback: () => void, delayMs: number): () => void;
}

type SubmitResult = PurchaseOutcome | { kind: 'ignored' };

interface ActiveAttempt {
  productId: string;
  intentId: string;
  resolve: (outcome: PurchaseOutcome) => void;
}

const RETRYABLE_CODES = new Set<string>([
  ERROR_CODES.SUBSCRIPTION_STORE_UNAVAILABLE,
  ERROR_CODES.NETWORK_ERROR,
  ERROR_CODES.TIMEOUT,
]);

/** 일시 실패인가 — 거래를 유지한 채 다시 보낼 대상. 서버 retryable 표시·네트워크·5xx */
const isRetryable = (error: unknown): boolean => {
  if (!isApiError(error)) return true; // 정규화되지 않은 실패는 응답을 못 받은 것이다
  return error.retryable || RETRYABLE_CODES.has(error.errorCode);
};

const toFailure = (error: unknown): PurchaseFailure => {
  if (error instanceof StoreError) {
    return error.kind === 'unavailable'
      ? 'storeUnavailable'
      : error.kind === 'network'
        ? 'network'
        : 'unknown';
  }
  if (!isApiError(error)) return 'unknown';
  switch (error.errorCode) {
    case ERROR_CODES.SUBSCRIPTION_PLAN_UNAVAILABLE:
      return 'planUnavailable';
    case ERROR_CODES.SUBSCRIPTION_STORE_MISMATCH:
      return 'storeMismatch';
    case ERROR_CODES.SUBSCRIPTION_RECEIPT_INVALID:
      return 'receiptInvalid';
    case ERROR_CODES.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT:
      return 'ownedByAnotherAccount';
    case ERROR_CODES.SUBSCRIPTION_STORE_UNAVAILABLE:
      return 'storeUnavailable';
    case ERROR_CODES.NETWORK_ERROR:
    case ERROR_CODES.TIMEOUT:
      return 'network';
    default:
      return 'unknown';
  }
};

/** 스토어 결제 시트의 실패 → 결과. 취소는 문구가 없는 정상 결과다 */
const fromStoreError = (error: unknown): PurchaseOutcome => {
  const storeError = toStoreError(error);
  switch (storeError.kind) {
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'pending':
      return { kind: 'pending' };
    case 'alreadyOwned':
      return { kind: 'alreadyOwned' };
    default:
      return { kind: 'failed', reason: toFailure(storeError) };
  }
};

export const createPurchaseService = (deps: PurchaseServiceDeps) => {
  let isStarted = false;
  let isConnected = false;
  let phase: PurchasePhase = 'idle';
  let activeAttempt: ActiveAttempt | null = null;
  const unsubscribers: (() => void)[] = [];
  /** 제출 중인 거래 — 결제 결과(반환값)와 리스너가 같은 거래를 두 번 들고 와도 한 번만 보낸다 */
  const inflight = new Map<string, Promise<SubmitResult>>();
  /** 서버 반영과 종료까지 끝난 거래 — 같은 세션에 다시 와도 무시한다 */
  const settled = new Set<string>();
  /** 일시 실패로 다시 보낼 거래 — 취소 함수와 시도 횟수 */
  const retries = new Map<string, { cancel: () => void; attempt: number }>();

  const setPhase = (next: PurchasePhase): void => {
    phase = next;
    deps.setUiState({ phase: next });
  };

  const syncDelayedFlag = (): void => {
    deps.setUiState({ isVerificationDelayed: retries.size > 0 });
  };

  const ensureConnected = async (): Promise<void> => {
    if (isConnected) return;
    await deps.adapter.connect();
    isConnected = true;
  };

  const toSubmitted = (purchase: StorePurchase, token: string): SubmittedTransaction =>
    deps.platform === 'ios'
      ? { platform: 'ios', signedTransaction: token }
      : { platform: 'android', purchaseToken: token, productId: purchase.productId };

  const cancelRetry = (transactionId: string): number => {
    const retry = retries.get(transactionId);
    if (!retry) return 0;
    retry.cancel();
    retries.delete(transactionId);
    return retry.attempt;
  };

  /** 일시 실패 — 거래를 끝내지 않은 채 간격을 늘려 다시 보낸다. 폐기하지 않는다(architecture.md 5.4) */
  const scheduleRetry = (
    purchase: StorePurchase,
    intentId: string | null,
    attempt: number,
  ): void => {
    const delay = SUBMIT_RETRY_DELAYS_MS[Math.min(attempt, SUBMIT_RETRY_DELAYS_MS.length - 1)];
    const cancel = deps.schedule(() => {
      retries.delete(purchase.transactionId);
      void submit(purchase, intentId, attempt + 1).then((result) => {
        if (result.kind === 'success') deps.onRecovered(result.subscription);
      });
    }, delay);
    retries.set(purchase.transactionId, { cancel, attempt });
    syncDelayedFlag();
  };

  const doSubmit = async (
    purchase: StorePurchase,
    token: string,
    intentId: string | null,
    attempt: number,
  ): Promise<SubmitResult> => {
    let subscription: MySubscription;
    try {
      subscription = await deps.api.submit({ transaction: toSubmitted(purchase, token), intentId });
    } catch (error) {
      if (isRetryable(error)) {
        scheduleRetry(purchase, intentId, attempt);
        return { kind: 'delayed' };
      }
      // 400·409 — 거래를 끝내지 않는다. 재시도해도 결과가 같아 자동 재시도하지 않는다(문의 경로 안내)
      logger.warn('[subscription] purchase rejected', isApiError(error) ? error.errorCode : error);
      return { kind: 'failed', reason: toFailure(error) };
    }

    settled.add(purchase.transactionId);
    syncDelayedFlag();
    // 서버가 반영(200)한 뒤에만 끝낸다. 종료가 실패해도 반영은 끝났다 — 다음 실행에 다시 제출되고 서버는 같은 결과를 준다
    try {
      await deps.adapter.finish(purchase);
    } catch (error) {
      logger.warn('[subscription] finish failed', error);
    }
    deps.onSubscriptionChanged(subscription);
    return { kind: 'success', subscription };
  };

  /** 서버 제출 — 같은 거래는 한 번만 보낸다. 결제 대기 거래는 아직 구독이 아니라 보내지 않는다 */
  const submit = (
    purchase: StorePurchase,
    intentId: string | null,
    attempt = 0,
  ): Promise<SubmitResult> => {
    if (settled.has(purchase.transactionId)) return Promise.resolve({ kind: 'ignored' });
    if (purchase.state === 'pending') return Promise.resolve({ kind: 'pending' });
    if (purchase.token === null) {
      logger.warn('[subscription] purchase without token', purchase.productId);
      return Promise.resolve({ kind: 'failed', reason: 'unknown' });
    }
    const existing = inflight.get(purchase.transactionId);
    if (existing) return existing;

    const nextAttempt = Math.max(attempt, cancelRetry(purchase.transactionId));
    const promise = doSubmit(purchase, purchase.token, intentId, nextAttempt).finally(() => {
      inflight.delete(purchase.transactionId);
    });
    inflight.set(purchase.transactionId, promise);
    return promise;
  };

  /** 스토어가 거래를 알려 왔다 — 지금 결제 중인 상품이면 그 시도의 결과로, 아니면 회복으로 처리한다 */
  const handlePurchaseUpdated = (purchase: StorePurchase): void => {
    const attempt = activeAttempt?.productId === purchase.productId ? activeAttempt : null;
    if (attempt) setPhase('verifying');
    void submit(purchase, attempt?.intentId ?? null).then((result) => {
      if (result.kind === 'ignored') return;
      if (attempt) attempt.resolve(result);
      else if (result.kind === 'success') deps.onRecovered(result.subscription);
    });
  };

  const handlePurchaseError = (error: StoreError): void => {
    activeAttempt?.resolve(fromStoreError(error));
  };

  /** 미완료 거래 제출 — 결제 직후 앱이 죽었거나 네트워크가 끊긴 경우를 회복한다(intent_id 없이) */
  const recoverUnfinished = async (): Promise<void> => {
    if (!isStarted) return;
    let unfinished: StorePurchase[];
    try {
      unfinished = await deps.adapter.getUnfinished();
    } catch (error) {
      // 백그라운드 동기화 실패는 사용자에게 알리지 않는다(architecture.md 5.4)
      logger.warn('[subscription] failed to read unfinished transactions', error);
      return;
    }
    for (const purchase of unfinished) {
      if (purchase.state !== 'purchased') continue;
      const result = await submit(purchase, null);
      if (result.kind === 'success') deps.onRecovered(result.subscription);
    }
  };

  return {
    /** 로그인 상태에서만 부른다 — 다른 계정의 세션으로 남의 거래를 제출하지 않는다 */
    start: async (): Promise<void> => {
      if (isStarted) return;
      isStarted = true;
      try {
        await ensureConnected();
      } catch (error) {
        isStarted = false;
        logger.warn('[subscription] store connection failed', error);
        return;
      }
      unsubscribers.push(
        deps.adapter.onPurchaseUpdated(handlePurchaseUpdated),
        deps.adapter.onPurchaseError(handlePurchaseError),
      );
      await recoverUnfinished();
    },

    /** 로그아웃·탈퇴 — 재시도를 멈춘다. 끝나지 않은 거래는 스토어에 남아 다음 로그인 계정이 아니라 그 거래의 주인이 제출한다 */
    stop: (): void => {
      unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
      retries.forEach((retry) => retry.cancel());
      retries.clear();
      inflight.clear();
      settled.clear();
      activeAttempt = null;
      isStarted = false;
      deps.setUiState({ phase: 'idle', isVerificationDelayed: false });
      phase = 'idle';
    },

    /** 포그라운드 복귀 — 미완료 거래를 다시 제출한다(재시도 대기 중이던 것도 즉시) */
    recoverUnfinished,

    /** 스토어 현지 가격 조회 — 화면은 이 값만 그린다. 실패하면 던진다("요금제를 불러올 수 없어요") */
    fetchStoreProducts: async (productIds: string[]): Promise<StoreProduct[]> => {
      if (productIds.length === 0) return [];
      await ensureConnected();
      return deps.adapter.fetchSubscriptions(productIds);
    },

    /**
     * [구독하기]·[업그레이드]·[변경] — 결제 의도 → 결제 시트 → 서버 제출 → 종료.
     * 결과는 한 번만 돌아온다. 화면은 결과 종류로 문구·닫기·자동 재생을 고른다.
     */
    purchase: async (plan: Plan, entryPoint: PurchaseEntryPoint): Promise<PurchaseOutcome> => {
      if (phase !== 'idle') return { kind: 'busy' };
      if (plan.storeProductId === null) return { kind: 'failed', reason: 'planUnavailable' };
      setPhase('purchasing');
      try {
        let intent: PurchaseIntent;
        try {
          intent = await deps.api.createIntent({
            planId: plan.planId,
            platform: deps.platform,
            entryPoint,
          });
        } catch (error) {
          if (isApiError(error) && error.errorCode === ERROR_CODES.EMAIL_REQUIRED_FOR_PURCHASE) {
            return { kind: 'emailRequired' };
          }
          return { kind: 'failed', reason: toFailure(error) };
        }

        try {
          await ensureConnected();
        } catch (error) {
          return { kind: 'failed', reason: toFailure(toStoreError(error)) };
        }

        const outcome = new Promise<PurchaseOutcome>((resolve) => {
          activeAttempt = { productId: intent.storeProductId, intentId: intent.intentId, resolve };
        });
        const attempt = activeAttempt as ActiveAttempt | null;

        try {
          const purchases = await deps.adapter.requestSubscription({
            productId: intent.storeProductId,
            accountToken: intent.accountToken,
          });
          // 결과가 바로 왔으면(iOS) 그 거래로 확정한다. 리스너가 같은 거래를 또 들고 와도 한 번만 제출된다
          const purchase = purchases.find((p) => p.productId === intent.storeProductId);
          if (purchase) handlePurchaseUpdated(purchase);
        } catch (error) {
          attempt?.resolve(fromStoreError(error));
        }
        return await outcome;
      } finally {
        activeAttempt = null;
        setPhase('idle');
      }
    },

    /** [구매 복원] — 스토어의 지금 유효한 구독을 서버가 재검증해 이 계정에 연결한다(subscription.md 4.6) */
    restore: async (): Promise<RestoreOutcome> => {
      if (phase !== 'idle') return { kind: 'busy' };
      setPhase('restoring');
      try {
        let purchases: StorePurchase[];
        try {
          await ensureConnected();
          purchases = await deps.adapter.getActiveForRestore();
        } catch (error) {
          return { kind: 'failed', reason: toFailure(toStoreError(error)) };
        }
        const transactions = purchases
          .filter((p) => p.state === 'purchased' && p.token !== null)
          .slice(0, RESTORE_MAX_ITEMS)
          .map((p) => toSubmitted(p, p.token as string));
        try {
          const result = await deps.api.restore({ platform: deps.platform, transactions });
          deps.onSubscriptionChanged(result.subscription);
          return result.restored
            ? { kind: 'restored', subscription: result.subscription }
            : { kind: 'nothingToRestore', subscription: result.subscription };
        } catch (error) {
          return {
            kind: 'failed',
            reason: isRetryable(error) && !isApiError(error) ? 'network' : toFailure(error),
          };
        }
      } finally {
        setPhase('idle');
      }
    },
  };
};

export type PurchaseService = ReturnType<typeof createPurchaseService>;
