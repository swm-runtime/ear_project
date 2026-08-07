import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

/** L11 최초 로딩 — 스켈레톤 카드 5개. 0.3초 미만이면 부모가 표시하지 않는다(uiux 4.9) */
export default function LibraryItemSkeleton() {
  return (
    <View accessibilityLabel="불러오는 중">
      {Array.from({ length: 5 }, (_, index) => (
        <View key={index} style={styles.card}>
          <View style={styles.thumbnail} />
          <View style={styles.lines}>
            <View style={styles.lineWide} />
            <View style={styles.lineNarrow} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  lines: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  lineWide: {
    height: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    alignSelf: 'stretch',
  },
  lineNarrow: {
    height: 12,
    width: '55%',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
});
