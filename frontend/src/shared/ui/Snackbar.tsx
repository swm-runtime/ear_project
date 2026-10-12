import type { ColorValue } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

import { Text } from './Typography';

interface SnackbarProps {
  message: string;
  action?: { label: string; onPress: () => void };
  backgroundColor?: ColorValue;
  color?: ColorValue;
}

/** 내용 너비로 뜨는 임시 안내. 위치·소멸 시간은 호스트가 소유한다. */
export default function Snackbar({
  message,
  action,
  backgroundColor = theme.color.textPrimary,
  color = theme.color.background,
}: SnackbarProps) {
  return (
    <View style={[styles.surface, { backgroundColor }]} accessibilityLiveRegion="polite">
      <Text style={[styles.message, { color }]}>{message}</Text>
      {action ? (
        <Pressable
          style={styles.action}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={[styles.actionLabel, { color }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignSelf: 'center',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  message: { flexShrink: 1, fontSize: theme.font.size.sm, lineHeight: theme.font.size.sm * 1.5 },
  action: {
    minWidth: theme.touchTarget.minHeight,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  actionLabel: { fontSize: theme.font.size.sm, fontWeight: '700' },
});
