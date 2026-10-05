import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { SkeletonBlock, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';

/** L11 최초 로딩 — 스켈레톤 타일 3행(6장). 0.3초 미만이면 부모가 표시하지 않는다(uiux 4.9) */
export default function LibraryItemSkeleton() {
  return (
    <SkeletonGroup style={styles.grid}>
      {Array.from({ length: 3 }, (_, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {Array.from({ length: 2 }, (_, index) => (
            <View key={index} style={styles.tile}>
              <SkeletonBlock radius="lg" style={styles.artwork} />
              <SkeletonLine height={14} />
              <SkeletonLine height={12} width="40%" />
            </View>
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  // 실제 격자(LibraryScreen gridContent·gridRow·LibraryItemTile)와 같은 크기·간격이어야 로딩이 끝날 때 목록이 튀지 않는다
  grid: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm * 1.5,
  },
  tile: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  artwork: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: theme.spacing.xs,
  },
});
