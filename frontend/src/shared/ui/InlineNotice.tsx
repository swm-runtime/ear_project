import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

import StatusIcon from './StatusIcon';
import { Text } from './Typography';

interface InlineNoticeProps {
  message: string;
  tone?: 'info' | 'warning' | 'error';
  offline?: boolean;
  action?: { label: string; onPress: () => void; busy?: boolean };
}

/** 관련 필드·설정 바로 아래 놓는 안내. 별도의 카드나 배경을 만들지 않는다. */
export default function InlineNotice({
  message,
  tone = 'info',
  offline = false,
  action,
}: InlineNoticeProps) {
  const color =
    tone === 'error'
      ? theme.color.danger
      : tone === 'warning'
        ? theme.color.warning
        : theme.color.textSecondary;
  return (
    <View
      style={styles.row}
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'warning' ? 'alert' : undefined}
    >
      <View style={styles.messageRow}>
        {offline || tone !== 'info' ? (
          <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
            <StatusIcon kind={offline ? 'offline' : 'warning'} color={color} />
          </View>
        ) : null}
        <Text style={[styles.message, { color }]}>{message}</Text>
      </View>
      {action ? (
        <Pressable
          style={styles.action}
          onPress={action.onPress}
          disabled={action.busy}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: !!action.busy, busy: !!action.busy }}
        >
          {action.busy ? (
            <ActivityIndicator size="small" color={theme.color.textSecondary} />
          ) : (
            <Text style={styles.actionLabel}>{action.label}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    flexShrink: 1,
  },
  icon: { marginTop: 2 },
  message: { flexShrink: 1, fontSize: theme.font.size.sm, lineHeight: theme.font.size.sm * 1.5 },
  action: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minHeight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  actionLabel: { fontSize: theme.font.size.sm, fontWeight: '600', color: theme.color.textPrimary },
});
