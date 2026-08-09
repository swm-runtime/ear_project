import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

/**
 * 최초 조회 스켈레톤 — 상단 계정·구독 카드와 관심 주제 요약 자리만(settings-uiux.md 4.6).
 * 정적 메뉴는 화면이 스켈레톤 밖에 즉시 노출한다. 0.3초 미만 미표시는 useDelayedVisible이 감싼다.
 */
export default function SettingsTopSkeleton() {
  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.row} />
      <View style={styles.card} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    overflow: 'hidden',
  },
  row: {
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  card: {
    height: 64,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
});
