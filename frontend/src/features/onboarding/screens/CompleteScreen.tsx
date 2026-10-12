import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { useCompleteScreen } from '../hooks/useCompleteScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

/**
 * O9 — 별도 화면을 보여주지 않는 **자동 통과**(2026-09-04 개편). 완료되면 바로 착지 화면(탐색)으로
 * 나간다. 완료 처리·알림 사전 안내 신호·뒤로가기 차단 판정은 훅 그대로다. 완료 요청이 실패한 경우에만
 * 재시도 UI를 그린다. 착지 화면 위에 띄우던 첫 사용 튜토리얼(코치마크)은 뺐다(PM 2026-10-11).
 * 문서 반영 요청: changes/pending/remove-first-run-tutorial.md
 */
export default function CompleteScreen() {
  const { completionStatus, isProcessing, handleStartPress } = useCompleteScreen();
  const firedRef = useRef(false);

  // 무엇과 동기화하나: 완료 상태 → 성공(비대기·비실패) 시 1회 자동 진행
  useEffect(() => {
    if (firedRef.current) return;
    if (completionStatus === 'pending' || completionStatus === 'error') return;
    firedRef.current = true;
    void handleStartPress();
  }, [completionStatus, handleStartPress]);

  if (completionStatus === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.body}>
          <Text style={styles.errorTitle}>{ONBOARDING_COPY.complete.failTitle}</Text>
          <Text style={styles.errorDescription}>
            {ONBOARDING_COPY.topic.loadFailedDescription}
          </Text>
          <Pressable
            style={styles.retry}
            disabled={isProcessing}
            onPress={() => void handleStartPress()}
            accessibilityRole="button"
            accessibilityLabel={ONBOARDING_COPY.topic.retry}
            accessibilityState={{ disabled: isProcessing }}
          >
            {isProcessing ? (
              <ActivityIndicator color={theme.color.onPrimary} />
            ) : (
              <Text style={styles.retryLabel}>{ONBOARDING_COPY.topic.retry}</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // 정상 경로 — 인플라이트가 끝나는 즉시 나가므로 스피너만 잠깐 보인다
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <ActivityIndicator color={theme.color.primary} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  errorTitle: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  retry: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  retryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
