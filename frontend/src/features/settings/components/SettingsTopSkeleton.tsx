import { StyleSheet, View } from 'react-native';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
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
      <View style={styles.section}>
        <View style={styles.label} />
        <View style={styles.card} />
      </View>
      {IS_SUBSCRIPTION_UI_ENABLED ? (
        <View style={styles.section}>
          <View style={styles.label} />
          <View style={styles.card} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    overflow: 'hidden',
  },
  section: {
    gap: theme.spacing.sm,
  },
  label: {
    width: theme.spacing.xl * 2,
    height: theme.font.size.xs,
    marginLeft: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  card: {
    // 계정 행의 최소 터치 높이 + 위아래 여백에 맞춰 조회 뒤의 위치 이동을 줄인다.
    height: theme.touchTarget.minHeight + theme.spacing.md * 2,
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
});
