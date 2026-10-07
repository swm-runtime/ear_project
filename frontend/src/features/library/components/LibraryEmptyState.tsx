import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

interface LibraryEmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

/** 빈 상태 4종(L6–L9)의 공통 골격 — 문구는 원인별로 다르며 재사용하지 않는다(uiux 4.8) */
export default function LibraryEmptyState({
  title,
  description,
  actionLabel,
  onActionPress,
}: LibraryEmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description !== undefined ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel !== undefined && onActionPress !== undefined ? (
        <Pressable
          style={[pillButton.base, pillButton.primary, styles.action]}
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={pillButton.primaryLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
    gap: theme.spacing.sm,
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
  // 크기만 — 모양·색은 공용 알약(pillButton)
  action: {
    marginTop: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight,
    minWidth: 140,
    paddingHorizontal: theme.spacing.lg,
  },
});
