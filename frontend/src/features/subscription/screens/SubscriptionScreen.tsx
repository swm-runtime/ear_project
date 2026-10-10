import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import LoadingOverlay from '@/shared/ui/LoadingOverlay';
import { Text } from '@/shared/ui/Typography';

import CurrentSubscriptionDetail from '../components/CurrentSubscriptionDetail';
import PlanList, { type CurrentPlanCta } from '../components/PlanList';
import PurchaseNotice from '../components/PurchaseNotice';
import SubscriptionLegalNotice from '../components/SubscriptionLegalNotice';
import { scheduledChangeNotice } from '../hooks/subscription-status';
import { useSubscriptionScreen } from '../hooks/useSubscriptionScreen';
import { SUBSCRIPTION_COPY } from '../subscription.copy';

const BACK_ICON_SIZE = 20;
/**
 * 제목 위 이어 로고(투명 배경 — KAN-146). 지금 파일은 assets/logo.png(흰 바탕 검정 선)에서 밝기를 투명도로 뽑아
 * 만든 임시본이다 — NAS 의 공식 투명 PNG(이어_로고_투명_512.png)가 들어오면 같은 이름으로 바꿔 끼운다
 */
const LOGO = require('../../../../assets/logo-transparent.png');
const LOGO_SIZE = 88;

/**
 * 요금제 관리 화면(SB1~SB3 — subscription-uiux.md). 진입점은 설정 "요금제 관리" 카드·프로필 [구독 알아보기].
 * 골격(KAN-146): 뒤로 버튼만 있는 앱바 → 로고 · "요금제 관리" → 요금제 카드(이용 중 카드 안에 현재 구독 정보) →
 * 결과 안내 → 필수 표기 + "이용약관 · 개인정보처리방침 · 구매 복원".
 * 화면은 뷰만 담당하고 로직은 useSubscriptionScreen 이 소유한다.
 */
export default function SubscriptionScreen() {
  const screen = useSubscriptionScreen();
  const navigation = useNavigation();
  const { flow } = screen;

  // 결제 진행 중 이탈 차단 — 뒤로가기·스와이프(subscription.md 5장). 동기화 대상: 진행 상태
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !flow.isBusy });
    if (!flow.isBusy) return;
    return navigation.addListener('beforeRemove', (event) => event.preventDefault());
  }, [flow.isBusy, navigation]);

  const catalogState = screen.catalog.state;
  /** 서버가 `current` 카드를 줬는가 — 줬으면 구독 정보가 그 카드 안에, 아니면 목록 밑에 홀로 선다(subscription-api.md 4.1) */
  const hasCurrentCard =
    catalogState.kind === 'ready' &&
    catalogState.cards.some((card) => card.plan.action === 'current');
  /** 낮출 수 있는 요금제가 있는가 — 있으면 제목 밑에 "기간 끝난 뒤 자동 변경"을 적는다(PM 2026-10-08 KAN-158) */
  const hasDowngradeCard =
    catalogState.kind === 'ready' &&
    catalogState.cards.some((card) => card.plan.action === 'downgrade');
  const status = screen.status;
  /** 무료 요금제의 서버 이름 — 해지 예약 알림의 "이후 {이름} 요금제로" */
  const freePlanName =
    catalogState.kind === 'ready'
      ? (catalogState.cards.find((card) => card.plan.priceKrw <= 0)?.plan.name ?? null)
      : null;
  /**
   * 다음 결제일부터 바뀌도록 예약된 요금제 — 그 카드를 잠그고 [예약됨]을 단다. 다운그레이드 예약은 서버 `pending_plan`,
   * 해지 예약은 무료 요금제 카드(가격 0 — 티어명으로 고르지 않는다)다(PM 2026-10-09 — 해지 뒤 Light 에 표시가 없었다)
   */
  const scheduledTier =
    status === null
      ? null
      : status.kind === 'subscribed'
        ? (status.pendingPlan?.tier ?? null)
        : status.kind === 'cancelScheduled' && catalogState.kind === 'ready'
          ? (catalogState.cards.find((card) => card.plan.priceKrw <= 0)?.plan.tier ?? null)
          : null;
  /** 예약된 변경 — 있을 때만 제목 밑 알림 섹션(KAN-160) */
  const notice = scheduledChangeNotice(status, freePlanName);
  const cancelHint =
    status !== null && status.kind === 'subscribed' && status.renewsAt !== null
      ? SUBSCRIPTION_COPY.status.cancelUntil(status.renewsAt)
      : null;
  /**
   * 이용 중 카드를 골랐을 때 아래 버튼(서버 구독 상태로 정한다) — 해지 예약이면 [구독 다시 시작], 결제 문제면 [결제 수단 확인],
   * 둘 다 스토어 구독 관리. 카드 안에는 버튼이 없다(PM 2026-10-08). 다른 스토어 구독·이용 중 카드 없음이면 없다
   */
  const currentPlan =
    catalogState.kind === 'ready'
      ? (catalogState.cards.find((card) => card.plan.action === 'current')?.plan ?? null)
      : null;
  /** 다운그레이드 예약 중인가 — iOS 는 [유지]로 되돌리고, Android 는 되돌릴 수 없어 카드에 안내만(PM 2026-10-08) */
  const pendingPlan = status !== null && status.kind === 'subscribed' ? status.pendingPlan : null;
  const canKeepCurrent =
    pendingPlan !== null && Platform.OS === 'ios' && currentPlan?.storeProductId != null;
  const currentCta: CurrentPlanCta | undefined =
    !hasCurrentCard || status === null || status.kind === 'free' || status.otherStore !== null
      ? undefined
      : status.kind === 'cancelScheduled'
        ? { label: SUBSCRIPTION_COPY.manage.resume, onPress: screen.openStoreManagement }
        : status.kind === 'grace'
          ? { label: SUBSCRIPTION_COPY.manage.checkPayment, onPress: screen.openStoreManagement }
          : canKeepCurrent && currentPlan !== null
            ? {
                // 지금 요금제를 다시 산다 — Apple 이 예약된 다운그레이드를 취소한다
                label: SUBSCRIPTION_COPY.plans.keepCurrent(currentPlan.name),
                onPress: () => void flow.purchase(currentPlan),
              }
            : undefined;
  /** Android 다운그레이드 예약 — Google Play 는 예약만 취소할 수 없어 바뀐 뒤 다시 올린다고 카드에 적는다 */
  const currentNote =
    pendingPlan !== null && Platform.OS === 'android'
      ? SUBSCRIPTION_COPY.status.revertAfterChange(pendingPlan.effectiveAt, pendingPlan.planName)
      : null;
  const renderDetail = (standalone: boolean) => (
    <CurrentSubscriptionDetail
      status={screen.status}
      isError={screen.isStatusError}
      standalone={standalone}
      note={standalone ? null : currentNote}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 앱바에는 뒤로 버튼만 — 화면 이름은 본문 첫 줄의 큰 제목이 말한다 */}
      <View style={styles.appBar}>
        <GlassIconButton onPress={screen.goBack} accessibilityLabel={SUBSCRIPTION_COPY.backA11y}>
          <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        <View style={styles.appBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Image
            source={LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.title} accessibilityRole="header">
            {SUBSCRIPTION_COPY.title}
          </Text>
          {/* 예약된 변경이 없을 때만 일반 안내 — 있으면 아래 알림 섹션이 대신 말한다 */}
          {notice === null && hasDowngradeCard ? (
            <Text style={styles.subtitle}>{SUBSCRIPTION_COPY.downgradeNotice}</Text>
          ) : null}
        </View>

        {/* 알림 섹션(KAN-160) — 다음 결제부터 무엇이 바뀌는지. 예약이 없으면 자리도 없다 */}
        {notice !== null ? (
          <View
            style={styles.notice}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`${notice.title}. ${notice.detail}`}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.noticeTitle}>{notice.title}</Text>
            <Text style={styles.noticeDetail}>{notice.detail}</Text>
          </View>
        ) : null}

        <PlanList
          state={catalogState}
          isBusy={flow.isBusy}
          purchasingPlanId={flow.purchasingPlanId}
          onPurchase={(plan) => void flow.purchase(plan)}
          onCancel={screen.openStoreManagement}
          cancelHint={cancelHint}
          currentCta={currentCta}
          scheduledTier={scheduledTier}
          onRetry={screen.catalog.retry}
          isRetrying={screen.catalog.isRetrying}
          currentDetail={renderDetail(false)}
        />
        {/* 이용 중 카드가 없을 때(비활성 요금제·다른 스토어 구독·요금제 조회 실패) — 해지 경로가 사라지지 않게 목록 밑에 */}
        {catalogState.kind !== 'loading' && !hasCurrentCard ? renderDetail(true) : null}
        <PurchaseNotice
          notice={flow.notice}
          isVerificationDelayed={flow.isVerificationDelayed}
          isVerifying={flow.phase === 'verifying'}
        />

        <SubscriptionLegalNotice
          onRestore={() => void flow.restore()}
          isRestoreDisabled={flow.isBusy}
          isRestoring={flow.phase === 'restoring'}
        />
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
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  appBarSpacer: {
    minWidth: HEADER_CONTROL_HEIGHT,
  },
  content: {
    padding: theme.spacing.md,
    // 좌우는 32 — 카드·버튼·유의사항이 한 세로선에 서고, SE(375)에서도 카드 311pt(KAN-146 PM 미리보기 확정 2026-10-07)
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  // 로고 88 → 8 → 제목 28 굵게, 가운데(KAN-146 PM 미리보기 확정)
  hero: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 0,
    marginBottom: theme.spacing.sm,
  },
  logo: {
    width: LOGO_SIZE,
    height: Math.round((LOGO_SIZE * 365) / 452),
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  // 알림 섹션 — 검정 면에 흰 글자(PM 2026-10-08). 회색 카드들 위에서 "바뀌는 것"이 먼저 읽힌다. 카드와 같은 모서리
  notice: {
    gap: 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md - 2,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
    marginBottom: theme.spacing.xs,
  },
  noticeTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.onPrimary,
    textAlign: 'center',
  },
  noticeDetail: {
    fontSize: theme.font.size.xs,
    color: theme.color.onPrimarySecondary,
    textAlign: 'center',
  },
});
