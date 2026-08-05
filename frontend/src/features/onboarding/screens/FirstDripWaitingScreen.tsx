import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { useFirstDripWaitingScreen } from '../hooks/useFirstDripWaitingScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

/**
 * O13 완료 대기 — 0건 담기 경로 전용 전체 화면 로딩(onboarding-uiux.md 4.5).
 * - 인디케이터·취소 버튼 없음, 뒤로가기 차단. 상한(서버 값)이 사용자 대신 빠져나가 준다.
 * - 진행률·남은 시간·재시도 중 안내를 표시하지 않는다 — 사용자가 할 수 있는 일이 없다.
 */
export default function FirstDripWaitingScreen() {
  const { isCompletionFailed, showLoading, handleRetryPress } = useFirstDripWaitingScreen();

  // 완료 요청 자체가 재시도 소진으로 실패 — 전체 화면 에러 + [다시 시도](onboarding-api.md 5장 INTERNAL_ERROR)
  if (isCompletionFailed) {
    return (
      <FullScreenError
        title={ONBOARDING_COPY.firstDripWaiting.completeFailedTitle}
        description={ONBOARDING_COPY.firstDripWaiting.completeFailedDescription}
        onRetry={handleRetryPress}
      />
    );
  }

  if (!showLoading) {
    // 0.3초 미만이면 표시하지 않는다 — 빈 배경만 두고 전환을 기다린다(common-error-handling.md 5)
    return <View style={styles.container} />;
  }

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={ONBOARDING_COPY.firstDripWaiting.message}
    >
      <ActivityIndicator size="large" color={theme.color.primary} />
      <Text style={styles.message}>{ONBOARDING_COPY.firstDripWaiting.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  message: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
