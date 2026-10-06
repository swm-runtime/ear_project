import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import LoadingOverlay from '@/shared/ui/LoadingOverlay';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import PlanList from '../components/PlanList';
import PurchaseNotice from '../components/PurchaseNotice';
import SubscriptionLegalNotice from '../components/SubscriptionLegalNotice';
import type { SubscriptionStatusVM } from '../hooks/subscription-status';
import { useSubscriptionScreen } from '../hooks/useSubscriptionScreen';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

const BACK_ICON_SIZE = 20;

interface StatusCardProps {
  status: SubscriptionStatusVM;
  onOpenStore: () => void;
}

/** SB1 현재 구독 — 상태별 문구는 프로필·설정 플랜 줄과 같은 사실(settings-uiux.md 4.1) */
function StatusCard({ status, onOpenStore }: StatusCardProps) {
  if (status.kind === 'free') {
    return (
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>{SUBSCRIPTION_COPY.status.free}</Text>
        <Text style={styles.statusBody}>
          {SUBSCRIPTION_COPY.status.freeLimit(status.dailyPlayLimit)}
        </Text>
      </View>
    );
  }

  const storeButton = (label: string) => (
    <Pressable
      style={({ pressed }) => [styles.storeButton, pressed ? styles.pressed : null]}
      onPress={onOpenStore}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.storeButtonLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.statusCard}>
      <Text style={styles.statusTitle}>{status.planName}</Text>
      {status.kind === 'subscribed' ? (
        <>
          {status.renewsAt !== null ? (
            <Text style={styles.statusBody}>
              {SUBSCRIPTION_COPY.status.renewsAt(status.renewsAt)}
            </Text>
          ) : null}
          {status.pendingPlan !== null ? (
            <Text style={styles.statusBody}>
              {SUBSCRIPTION_COPY.status.pendingPlan(
                status.pendingPlan.effectiveAt,
                status.pendingPlan.planName,
              )}
            </Text>
          ) : null}
        </>
      ) : null}
      {status.kind === 'cancelScheduled' && status.expiresAt !== null ? (
        <Text style={styles.statusBody}>
          {SUBSCRIPTION_COPY.status.cancelScheduled(status.expiresAt)}
        </Text>
      ) : null}
      {status.kind === 'grace' ? (
        // 결제 문제 — 경고색을 쓰는 유일한 상태. 색만이 아니라 제목 글자로도 밝힌다
        <View style={styles.warningBanner} accessibilityRole="alert">
          <Text style={styles.warningTitle}>{SUBSCRIPTION_COPY.status.paymentIssueTitle}</Text>
          <Text style={styles.warningBody}>{SUBSCRIPTION_COPY.status.paymentIssueBody}</Text>
        </View>
      ) : null}
      {status.otherStore !== null ? (
        <Text style={styles.statusBody}>
          {SUBSCRIPTION_COPY.status.otherStore(status.otherStore)}
        </Text>
      ) : status.kind === 'subscribed' ? (
        storeButton(SUBSCRIPTION_COPY.manage.cancel)
      ) : status.kind === 'cancelScheduled' ? (
        storeButton(SUBSCRIPTION_COPY.manage.resume)
      ) : (
        storeButton(SUBSCRIPTION_COPY.manage.checkPayment)
      )}
    </View>
  );
}

/**
 * 구독 관리 화면(SB1~SB3 — subscription-uiux.md). 진입점은 설정 구독 카드·프로필 [구독 알아보기].
 * 화면은 뷰만 담당하고 로직은 useSubscriptionScreen 이 소유한다.
 */
export default function SubscriptionScreen() {
  const screen = useSubscriptionScreen();
  const navigation = useNavigation();
  const showSkeleton = useDelayedVisible(screen.isInitialLoading);
  const { flow } = screen;

  // 결제 진행 중 이탈 차단 — 뒤로가기·스와이프(subscription.md 5장). 동기화 대상: 진행 상태
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !flow.isBusy });
    if (!flow.isBusy) return;
    return navigation.addListener('beforeRemove', (event) => event.preventDefault());
  }, [flow.isBusy, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.appBar}>
        <GlassIconButton onPress={screen.goBack} accessibilityLabel={SUBSCRIPTION_COPY.backA11y}>
          <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {SUBSCRIPTION_COPY.title}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {SUBSCRIPTION_COPY.status.sectionTitle}
        </Text>
        {screen.status !== null ? (
          <StatusCard status={screen.status} onOpenStore={screen.openStoreManagement} />
        ) : screen.isStatusError ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusBody}>{SUBSCRIPTION_COPY.status.loadError}</Text>
            <Pressable
              style={styles.inlineRetry}
              onPress={screen.retryStatus}
              disabled={screen.isStatusRetrying}
              accessibilityRole="button"
              accessibilityLabel={SUBSCRIPTION_COPY.error.retry}
            >
              <Text style={styles.inlineRetryLabel}>{SUBSCRIPTION_COPY.error.retry}</Text>
            </Pressable>
          </View>
        ) : showSkeleton ? (
          <SkeletonGroup accessibilityLabel={SUBSCRIPTION_COPY.loadingA11y}>
            <SkeletonBlock height={72} radius="lg" />
          </SkeletonGroup>
        ) : null}

        <Text style={styles.sectionTitle} accessibilityRole="header">
          {SUBSCRIPTION_COPY.plans.sectionTitle}
        </Text>
        <PlanList
          state={screen.catalog.state}
          isBusy={flow.isBusy}
          purchasingPlanId={flow.purchasingPlanId}
          onPurchase={(plan) => void flow.purchase(plan)}
          onRetry={screen.catalog.retry}
          isRetrying={screen.catalog.isRetrying}
        />
        <PurchaseNotice
          notice={flow.notice}
          isVerificationDelayed={flow.isVerificationDelayed}
          isVerifying={flow.phase === 'verifying'}
        />

        <Pressable
          style={styles.restore}
          onPress={() => void flow.restore()}
          disabled={flow.isBusy}
          accessibilityRole="button"
          accessibilityLabel={SUBSCRIPTION_COPY.restore}
          accessibilityState={{ disabled: flow.isBusy, busy: flow.phase === 'restoring' }}
        >
          <Text style={styles.restoreLabel}>{SUBSCRIPTION_COPY.restore}</Text>
        </Pressable>

        <SubscriptionLegalNotice />
      </ScrollView>

      {/* 결제·복원 진행 중 — 전체 로딩(subscription.md 5장). 검증 중 문구는 위 안내가 읽힌다 */}
      <LoadingOverlay visible={flow.phase === 'purchasing' || flow.phase === 'restoring'} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  appBarSpacer: {
    minWidth: HEADER_CONTROL_HEIGHT,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  statusCard: {
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  statusTitle: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  statusBody: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  warningBanner: {
    marginTop: theme.spacing.xs,
    padding: theme.spacing.sm,
    gap: 2,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.warningSurface,
  },
  warningTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.warning,
  },
  warningBody: {
    fontSize: theme.font.size.xs,
    color: theme.color.warning,
  },
  storeButton: {
    marginTop: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
  },
  storeButtonLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  pressed: {
    opacity: 0.8,
  },
  inlineRetry: {
    alignSelf: 'flex-start',
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  inlineRetryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  restore: {
    alignSelf: 'center',
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  restoreLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textDecorationLine: 'underline',
  },
});
