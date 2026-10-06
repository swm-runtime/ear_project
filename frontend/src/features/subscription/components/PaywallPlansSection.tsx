import { StyleSheet, View } from 'react-native';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { theme } from '@/shared/theme';
import { useToastStore } from '@/shared/ui/toast.store';

import PlanList from './PlanList';
import PurchaseNotice from './PurchaseNotice';
import SubscriptionLegalNotice from './SubscriptionLegalNotice';
import { usePlanCatalog } from '../hooks/usePlanCatalog';
import { usePurchaseFlow } from '../hooks/usePurchaseFlow';
import { PAYWALL_VERIFY_TIMEOUT_MS } from '../subscription.constants';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

export interface PaywallPlansSectionProps {
  /** 구독(또는 복원)이 확정됐다 — 시트를 닫고 막혔던 콘텐츠를 재생한다(paywall.md 4.5-5) */
  onEntitled: () => void;
  /** 결제는 됐지만 반영이 늦다 — 안내 후 시트를 닫는다(paywall.md 5장) */
  onDelayed: () => void;
  /** 이메일 등록·인증 화면으로 간다 — 시트를 내린다(인증을 마치면 시트가 다시 열려 결제가 이어진다) */
  onEmailGate: () => void;
}

/**
 * 페이월의 요금제 비교·결제 버튼 — 한도 안내 시트 밑에 얹는다(paywall.md 4.5 "구독 UI 플래그가 켜지면 이 시트가
 * 페이월의 자리다"). 구성: 3티어 비교 / 티어별 버튼 / 약관·해지 안내 + 맨 아래 "이용약관 · 개인정보처리방침 · 구매 복원"
 * 한 줄(paywall.md 5장 "바텀시트 구성" · KAN-146 — 요금제 관리 화면과 같은 줄).
 * **구독 UI 가 꺼진 바이너리에서는 아무것도 그리지 않는다** — 플래그·결제 모듈·플랫폼 세 겹(feature-flags.ts).
 */
export default function PaywallPlansSection(props: PaywallPlansSectionProps) {
  if (!IS_SUBSCRIPTION_UI_ENABLED) return null;
  return <PaywallPlansSectionContent {...props} />;
}

function PaywallPlansSectionContent({
  onEntitled,
  onDelayed,
  onEmailGate,
}: PaywallPlansSectionProps) {
  const catalog = usePlanCatalog();
  const showToast = useToastStore((s) => s.show);
  const flow = usePurchaseFlow({
    entryPoint: 'paywall',
    catalog,
    onEntitled,
    // 시트가 닫히므로 안내는 토스트로 남긴다 — "잠시 후 자동 반영됩니다" 안내 후 시트 닫기(paywall.md 5장)
    onDelayed: () => {
      showToast(SUBSCRIPTION_COPY.result.delayed);
      onDelayed();
    },
    onEmailGate,
    verifyTimeoutMs: PAYWALL_VERIFY_TIMEOUT_MS,
  });

  return (
    <View style={styles.container}>
      <PlanList
        state={catalog.state}
        isBusy={flow.isBusy}
        purchasingPlanId={flow.purchasingPlanId}
        onPurchase={(plan) => void flow.purchase(plan)}
        onRetry={catalog.retry}
        isRetrying={catalog.isRetrying}
      />
      <PurchaseNotice
        notice={flow.notice}
        isVerificationDelayed={flow.isVerificationDelayed}
        isVerifying={flow.phase === 'verifying'}
      />
      {/* 복원 링크는 약관 줄 안 — 스토어 심사 요건(subscription.md 4.6) */}
      <SubscriptionLegalNotice
        onRestore={() => void flow.restore()}
        isRestoreDisabled={flow.isBusy}
        isRestoring={flow.phase === 'restoring'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
});
