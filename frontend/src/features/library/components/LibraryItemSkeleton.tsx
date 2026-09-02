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
  // 실제 카드(LibraryItemCard)와 같은 크기·간격이어야 로딩이 끝날 때 목록이 튀지 않는다
  card: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.background,
  },
  lines: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  // 카드(surface) 위에 놓이는 선은 같은 색이면 보이지 않는다 — 배경색으로 뒤집는다
  lineWide: {
    height: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.background,
    alignSelf: 'stretch',
  },
  lineNarrow: {
    height: 12,
    width: '55%',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.background,
  },
});
