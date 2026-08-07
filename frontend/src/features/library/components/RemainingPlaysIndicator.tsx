import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';

interface RemainingPlaysIndicatorProps {
  remaining: number;
  limit: number;
  /** 소진 상태에서만 탭 → 페이월(library-uiux.md 4.3). N > 0이면 탭 대상이 아니다 */
  onExhaustedPress: () => void;
}

/**
 * 앱바 잔여 재생 표시. 무제한·캐시·값 없음이면 부모가 렌더하지 않는다 — 자리를 비운다.
 * 문구는 paywall.md 5장과 같은 한 문자열만 쓴다.
 */
export default function RemainingPlaysIndicator({
  remaining,
  limit,
  onExhaustedPress,
}: RemainingPlaysIndicatorProps) {
  const isExhausted = remaining === 0;

  if (!isExhausted) {
    return (
      <Text
        style={styles.label}
        accessibilityLabel={LIBRARY_COPY.remaining.a11yLabel(remaining, limit)}
        accessibilityLiveRegion="polite"
      >
        {LIBRARY_COPY.remaining.label(remaining, limit)}
      </Text>
    );
  }

  return (
    <Pressable
      style={styles.exhaustedButton}
      onPress={onExhaustedPress}
      accessibilityRole="button"
      accessibilityLabel={LIBRARY_COPY.remaining.a11yLabelExhausted}
    >
      <Text style={styles.exhaustedLabel}>{LIBRARY_COPY.remaining.label(0, limit)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  exhaustedButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  exhaustedLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.danger,
  },
});
