import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface FullScreenErrorProps {
  title: string;
  description?: string;
  retryLabel?: string;
  /** 인플라이트 중 연타는 무시한다(common-error-handling.md 7) */
  isRetrying?: boolean;
  onRetry: () => void;
}

/** 화면 진입 조회 실패의 공통 표현(architecture.md 8.3) — [다시 시도]만 두고 진행 경로를 열지 않는다 */
export default function FullScreenError({
  title,
  description,
  retryLabel = '다시 시도',
  isRetrying = false,
  onRetry,
}: FullScreenErrorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description !== undefined ? <Text style={styles.description}>{description}</Text> : null}
      <Pressable
        style={styles.retry}
        disabled={isRetrying}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
        accessibilityState={{ disabled: isRetrying }}
      >
        {isRetrying ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={styles.retryLabel}>{retryLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
    backgroundColor: theme.color.background,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  retry: {
    marginTop: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight,
    minWidth: 120,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  retryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
