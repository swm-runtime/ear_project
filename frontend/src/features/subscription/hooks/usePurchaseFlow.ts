import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { useToastStore } from '@/shared/ui/toast.store';

import { fetchMySubscription, subscriptionKeys } from '../api/subscription.api';
import { openEmailVerification } from '../services/email-verification-opener';
import type { PurchaseOutcome } from '../services/purchase.service';
import { purchaseService } from '../services/subscription-sync';
import { useSubscriptionPurchaseStore } from '../store/subscription-purchase.store';
import { EMAIL_RESUME_TTL_MS } from '../subscription.constants';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { MySubscription, Plan, PurchaseEntryPoint } from '../subscription.types';
import { toPurchaseFeedback, toRestoreFeedback, type PurchaseFeedback } from './purchase-feedback';
import type { usePlanCatalog } from './usePlanCatalog';

interface PurchaseFlowOptions {
  entryPoint: PurchaseEntryPoint;
  catalog: ReturnType<typeof usePlanCatalog>;
  /** 서버가 구독(또는 복원)을 확정했다 — 페이월은 시트를 닫고 막혔던 콘텐츠를 재생한다 */
  onEntitled?: (subscription: MySubscription) => void;
  /** 결제는 됐지만 반영이 늦다 — 페이월은 안내 후 시트를 닫는다(paywall.md 5장) */
  onDelayed?: () => void;
  /** 이메일 등록·인증 화면으로 간다 — 페이월은 시트를 내린다 */
  onEmailGate?: () => void;
  /** "구독을 확인하고 있어요" 최대 유지 시간 — 넘기면 onDelayed(페이월만 쓴다) */
  verifyTimeoutMs?: number;
}

/**
 * 결제·복원 흐름 — 페이월 시트와 구독 관리 화면이 같은 흐름을 쓴다. 판정은 서버·스토어가 하고
 * 이 훅은 결과를 화면 반응(토스트·인라인 안내·닫기)으로 옮긴다.
 */
export const usePurchaseFlow = (options: PurchaseFlowOptions) => {
  const { entryPoint, catalog } = options;
  const phase = useSubscriptionPurchaseStore((s) => s.phase);
  const isVerificationDelayed = useSubscriptionPurchaseStore((s) => s.isVerificationDelayed);
  const emailResume = useSubscriptionPurchaseStore((s) => s.emailResume);
  const setEmailResume = useSubscriptionPurchaseStore((s) => s.setEmailResume);
  const showToast = useToastStore((s) => s.show);
  const [notice, setNotice] = useState<PurchaseFeedback['notice']>(null);
  /** 결제 시트를 연 요금제 — 그 버튼에만 스피너를 둔다 */
  const [purchasingPlanId, setPurchasingPlanId] = useState<string | null>(null);
  /**
   * 지금 구독(요금제 관리 화면과 같은 캐시) — 이벤트 중 결제 확인(KAN-182)에만 쓴다. 페이월에서 처음 열려도 한 번 받는다
   */
  const meQuery = useQuery<MySubscription>({
    queryKey: subscriptionKeys.me(),
    queryFn: fetchMySubscription,
    enabled: IS_SUBSCRIPTION_UI_ENABLED,
  });
  const meRef = useRef(meQuery.data);
  useEffect(() => {
    meRef.current = meQuery.data;
  });

  // 콜백은 매 렌더 바뀌어도 진행 중인 결제가 최신 것을 부르게 ref 로 든다
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const apply = useCallback(
    (feedback: PurchaseFeedback) => {
      if (feedback.toast !== null) showToast(feedback.toast);
      setNotice(feedback.notice);
      if (feedback.shouldRefetchPlans) optionsRef.current.catalog.refetchPlans();
    },
    [showToast],
  );

  /** 인증된 이메일이 없다 — 등록·인증 화면을 먼저 열고, 마치면 같은 요금제로 돌아온다(auth.md 4.4) */
  const goToEmailVerification = useCallback(
    (plan: Plan) => {
      setEmailResume({
        planId: plan.planId,
        entryPoint,
        requestedAt: Date.now(),
        isVerified: false,
      });
      showToast(SUBSCRIPTION_COPY.result.emailRequired);
      optionsRef.current.onEmailGate?.();
      openEmailVerification();
    },
    [entryPoint, setEmailResume, showToast],
  );

  const purchase = useCallback(
    async (plan: Plan): Promise<void> => {
      if (useSubscriptionPurchaseStore.getState().phase !== 'idle') return;
      setNotice(null);
      const state = optionsRef.current.catalog.state;
      // 서버가 다시 막지만(EMAIL_REQUIRED_FOR_PURCHASE) 정상 경로는 목록의 값으로 먼저 거른다
      if (state.kind === 'ready' && !state.isEmailVerified) {
        goToEmailVerification(plan);
        return;
      }
      // 다운그레이드는 결제 시트 전에 한 번 묻는다 — 지금 요금제는 기간 끝까지, 그 뒤 자동 변경(PM 2026-10-08 KAN-158).
      // 예약을 못 하는 빌드(Android 교체 모듈 없음)는 묻지 않고 서비스가 업데이트 안내로 끝낸다
      if (plan.action === 'downgrade' && purchaseService.supportsDeferredDowngrade) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            SUBSCRIPTION_COPY.plans.downgradeConfirmTitle(plan.name),
            Platform.OS === 'android'
              ? SUBSCRIPTION_COPY.plans.downgradeConfirmMessageAndroid
              : SUBSCRIPTION_COPY.plans.downgradeConfirmMessage,
            [
              {
                text: SUBSCRIPTION_COPY.plans.downgradeConfirmCancel,
                style: 'cancel',
                onPress: () => resolve(false),
              },
              { text: SUBSCRIPTION_COPY.plans.downgradeConfirmOk, onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) return;
      }
      // 이벤트 중 결제(KAN-182 · subscription-api.md 4.8) — 구독 없이 초대 코드 지급 중이면 결제가 지급을 끝낸다. 결제 시트 전에 한 번 묻는다.
      // "입력 때 구독이 있었나"는 앱이 모르므로 **지급 중 + 지금 status free** 일 때만 묻는다. 고른 요금제가 지급보다 높든 낮든
      // 같은 확인이다 — 티어를 앱이 비교하지 않는다(Pro 이벤트 중 Daily 도 막지 않고 같은 확인을 거친다)
      const grant = meRef.current?.plan.grant ?? null;
      if (grant !== null && meRef.current?.plan.status === 'free') {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            SUBSCRIPTION_COPY.grant.purchaseConfirmTitle(grant.name),
            SUBSCRIPTION_COPY.grant.purchaseConfirmMessage(plan.name),
            [
              {
                text: SUBSCRIPTION_COPY.grant.purchaseConfirmCancel,
                style: 'cancel',
                onPress: () => resolve(false),
              },
              { text: SUBSCRIPTION_COPY.grant.purchaseConfirmOk, onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) return;
      }
      // 서버의 지금 구독 상품(이용 중 카드) — Android 교체 대상을 기기 구매 중에서 고를 때 쓴다
      const currentProductId =
        state.kind === 'ready'
          ? (state.cards.find((card) => card.plan.action === 'current')?.plan.storeProductId ??
            null)
          : null;
      setPurchasingPlanId(plan.planId);
      let outcome: PurchaseOutcome;
      try {
        outcome = await purchaseService.purchase(plan, entryPoint, currentProductId);
      } finally {
        setPurchasingPlanId(null);
      }
      if (outcome.kind === 'emailRequired') {
        goToEmailVerification(plan);
        return;
      }
      apply(toPurchaseFeedback(outcome, plan.action));
      if (outcome.kind === 'success') optionsRef.current.onEntitled?.(outcome.subscription);
      if (outcome.kind === 'delayed') optionsRef.current.onDelayed?.();
    },
    [apply, entryPoint, goToEmailVerification],
  );

  const restore = useCallback(async (): Promise<void> => {
    setNotice(null);
    const outcome = await purchaseService.restore();
    // 복원할 거래는 있는데 인증된 이메일이 없다 — 등록·인증 화면으로 보낸다(KAN-169). 결제와 달리 이어서 할 요금제가
    // 없으니 돌아와 [구매 복원]을 다시 누르게 둔다. 버튼을 미리 막지 않는다 — 복원할 게 없으면 이메일 없이도 200 이다
    if (outcome.kind === 'emailRequired') {
      showToast(SUBSCRIPTION_COPY.result.restoreEmailRequired);
      optionsRef.current.onEmailGate?.();
      openEmailVerification();
      return;
    }
    apply(toRestoreFeedback(outcome));
    if (outcome.kind === 'restored') optionsRef.current.onEntitled?.(outcome.subscription);
  }, [apply, showToast]);

  /* ── 이메일 인증을 마치고 돌아왔다 — 같은 요금제로 결제 흐름을 잇는다 ──
   * 동기화 대상: 인증 성공 통지(store.isVerified) + 다시 받은 요금제 목록(is_email_verified). 목록이 아직 옛 값이면 기다린다 */
  const isCatalogVerified = catalog.state.kind === 'ready' && catalog.state.isEmailVerified;
  useEffect(() => {
    if (emailResume === null || !emailResume.isVerified || emailResume.entryPoint !== entryPoint)
      return;
    if (Date.now() - emailResume.requestedAt > EMAIL_RESUME_TTL_MS) {
      setEmailResume(null);
      return;
    }
    if (!isCatalogVerified) return;
    // 요청 소비와 결제 시작은 렌더 밖(다음 틱)에서 한다 — 그 사이 의존값이 바뀌면 취소되고 다시 잡힌다
    const planId = emailResume.planId;
    const timer = setTimeout(() => {
      setEmailResume(null);
      const plan = optionsRef.current.catalog.findPlan(planId);
      if (plan !== null) void purchase(plan);
    }, 0);
    return () => clearTimeout(timer);
  }, [emailResume, entryPoint, isCatalogVerified, purchase, setEmailResume]);

  /* ── 검증이 오래 걸린다 — 최대 시간을 넘기면 "잠시 후 자동 반영"으로 넘긴다(paywall.md 5장, 최대 30초) ── */
  const verifyTimeoutMs = options.verifyTimeoutMs;
  useEffect(() => {
    if (phase !== 'verifying' || verifyTimeoutMs === undefined) return;
    const timer = setTimeout(() => {
      setNotice({ message: SUBSCRIPTION_COPY.result.delayed, tone: 'info' });
      optionsRef.current.onDelayed?.();
    }, verifyTimeoutMs);
    return () => clearTimeout(timer);
  }, [phase, verifyTimeoutMs]);

  return {
    phase,
    /** 결제·복원 진행 중 — 버튼 비활성·닫기 차단 */
    isBusy: phase !== 'idle',
    isVerificationDelayed,
    purchasingPlanId,
    notice,
    purchase,
    restore,
  };
};
