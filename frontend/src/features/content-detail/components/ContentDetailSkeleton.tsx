import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

/**
 * CD3 로딩 스켈레톤 — 헤더(썸네일·제목 2줄)·메타 자리만 그린다(content-detail-uiux.md 4.7).
 * 액션 버튼은 그리지 않는다 — 담김 여부를 모르는 상태에서 어느 쪽도 그릴 수 없다.
 * 0.3초 미만 미표시(useDelayedVisible)는 화면이 담당한다.
 */
export default function ContentDetailSkeleton() {
  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.header}>
        <View style={styles.thumbnail} />
        <View style={styles.headerText}>
          <View style={styles.lineWide} />
          <View style={styles.lineNarrow} />
        </View>
      </View>
      <View style={styles.metaBlock}>
        <View style={styles.metaLine} />
        <View style={styles.metaLine} />
        <View style={styles.metaLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  headerText: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  lineWide: {
    height: theme.font.size.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    alignSelf: 'stretch',
  },
  lineNarrow: {
    height: theme.font.size.md,
    width: '60%',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  metaBlock: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  metaLine: {
    height: theme.font.size.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    width: '70%',
  },
});
