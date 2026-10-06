import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

interface ExploreEmptyStateProps {
  title: string;
  actionLabel: string;
  onActionPress: () => void;
}

/** E8·E9 빈 상태 — 원인이 다르므로 문구를 공유하지 않는다(explore-uiux.md 4.7) */
export default function ExploreEmptyState({
  title,
  actionLabel,
  onActionPress,
}: ExploreEmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Pressable
        style={[pillButton.base, styles.action]}
        onPress={onActionPress}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={styles.actionLabel}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  // 테두리 알약 — 모양은 공용 알약(pillButton.base), 테두리만 여기서
  action: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.color.primary,
  },
  actionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
