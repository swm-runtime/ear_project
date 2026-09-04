import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import { useWalkthroughStore } from '@/shared/ui/walkthrough.store';

import { useCompleteScreen } from '../hooks/useCompleteScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

/**
 * O9 — 별도 화면을 보여주지 않는 **자동 통과**(2026-09-04 개편).
 * 요약·튜토리얼 카드 대신, 착지한 실제 화면(탐색) 위의 코치마크가 안내를 대신한다 —
 * 여기서는 코치마크 신호만 세우고 바로 나간다. 완료 처리·알림 사전 안내 신호·뒤로가기
 * 차단 판정은 훅 그대로다. 완료 요청이 실패한 경우에만 재시도 UI를 그린다.
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md
 */
export default function CompleteScreen() {
  const { completionStatus, isProcessing, handleStartPress } = useCompleteScreen();
  const markWalkthroughPending = useWalkthroughStore((s) => s.markPending);
  const firedRef = useRef(false);

  // 무엇과 동기화하나: 완료 상태 → 성공(비대기·비실패) 시 1회 자동 진행 + 코치마크 신호
  useEffect(() => {
    if (firedRef.current) return;
    if (completionStatus === 'pending' || completionStatus === 'error') return;
    firedRef.current = true;
    markWalkthroughPending();
    void handleStartPress();
  }, [completionStatus, handleStartPress, markWalkthroughPending]);

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
