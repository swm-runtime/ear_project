import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import { useToastStore } from './toast.store';

/** auth-uiux.md 5 — 토스트는 3초 후 자동 소멸한다 */
const TOAST_DURATION_MS = 3_000;

export default function Toast() {
  const message = useToastStore((s) => s.message);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();

  // 메시지 표시와 자동 소멸 타이머를 동기화한다
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(hide, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, hide]);

  if (message === null) return null;

  return (
    <View
      style={[styles.container, { bottom: insets.bottom + theme.spacing.xl }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.toast}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: theme.color.textPrimary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm + theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  message: {
    color: theme.color.background,
    fontSize: theme.font.size.sm,
  },
});
