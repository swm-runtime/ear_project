import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import LoadingOverlay from '@/shared/ui/LoadingOverlay';
import { Text } from '@/shared/ui/Typography';

import CurrentSubscriptionDetail from '../components/CurrentSubscriptionDetail';
import PlanList from '../components/PlanList';
import PurchaseNotice from '../components/PurchaseNotice';
import SubscriptionLegalNotice from '../components/SubscriptionLegalNotice';
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
  const renderDetail = (standalone: boolean) => (
    <CurrentSubscriptionDetail
      status={screen.status}
      isError={screen.isStatusError}
      onRetry={screen.retryStatus}
      isRetrying={screen.isStatusRetrying}
      onOpenStore={screen.openStoreManagement}
      standalone={standalone}
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
        </View>

        <PlanList
          state={catalogState}
          isBusy={flow.isBusy}
          purchasingPlanId={flow.purchasingPlanId}
          onPurchase={(plan) => void flow.purchase(plan)}
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
});
