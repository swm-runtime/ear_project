import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

import StatusIcon from './StatusIcon';
import { Text } from './Typography';

interface InlineNoticeProps {
  message: string;
  tone?: 'info' | 'warning' | 'error';
  offline?: boolean;
  action?: { label: string; onPress: () => void; busy?: boolean };
  /**
   * stacked — 문구를 가운데에 두고 버튼을 다음 줄 가운데에(검색 실패, PM 2026-10-11 19:43 "라이브러리처럼 가운데, 다시 시도는
   * 다음 줄"). 기본은 한 줄(문구 + 오른쪽 버튼)
   */
  layout?: 'inline' | 'stacked';
}

/** 관련 필드·설정 바로 아래 놓는 안내. 별도의 카드나 배경을 만들지 않는다. */
export default function InlineNotice({
  message,
  tone = 'info',
  offline = false,
  action,
  layout = 'inline',
}: InlineNoticeProps) {
  const stacked = layout === 'stacked';
  const color =
    tone === 'error'
      ? theme.color.danger
      : tone === 'warning'
        ? theme.color.warning
        : theme.color.textSecondary;
  return (
    <View
      style={stacked ? styles.stacked : styles.row}
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'warning' ? 'alert' : undefined}
    >
      <View style={styles.messageRow}>
        {offline || tone !== 'info' ? (
          <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
            <StatusIcon kind={offline ? 'offline' : 'warning'} color={color} />
          </View>
        ) : null}
        <Text style={[styles.message, stacked && styles.messageCentered, { color }]}>
          {message}
        </Text>
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
  // 버튼의 44pt 터치 높이가 줄 간격을 이미 벌려 두어 gap 은 두지 않는다
  stacked: { alignItems: 'center' },
  messageCentered: { textAlign: 'center' },
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
