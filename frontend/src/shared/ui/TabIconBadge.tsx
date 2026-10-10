import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

/** 아이콘 오른쪽 위의 숫자 배지 — 탭 자체가 개수·의미를 읽으므로 장식으로 숨긴다. */
export default function TabIconBadge({ value }: { value: number | string | undefined }) {
  if (value === undefined) return null;
  return (
    <View
      style={styles.badge}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.text} maxFontSizeMultiplier={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    left: 18,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: theme.font.size.xs,
    lineHeight: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: theme.color.onPrimary,
  },
});
