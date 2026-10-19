import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { SkeletonBlock, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';

import { SERIES_EPISODE_THUMBNAIL_SIZE } from './SeriesEpisodeRow';
import { SERIES_COVER_SIZE } from './SeriesHeader';

/** 편 행 자리 수 — 첫 화면에 보이는 몫 */
const ROW_COUNT = 4;

/**
 * E14 로딩 스켈레톤 — 머리(표지·제목·편수)와 편 행 자리만 실제 치수로 그린다(design.md §5 스켈레톤).
 * 0.3초 미만 미표시(useDelayedVisible)는 화면이 담당한다
 */
export default function SeriesSkeleton() {
  return (
    <SkeletonGroup style={styles.root}>
      <View style={styles.header}>
        <SkeletonBlock width={SERIES_COVER_SIZE} height={SERIES_COVER_SIZE} radius="lg" />
        <SkeletonLine height={theme.font.size.lg} width="60%" />
        <SkeletonLine height={theme.font.size.sm} width="30%" />
      </View>
      {Array.from({ length: ROW_COUNT }, (_, index) => (
        <View key={index} style={styles.row}>
          <SkeletonBlock
            width={SERIES_EPISODE_THUMBNAIL_SIZE}
            height={SERIES_EPISODE_THUMBNAIL_SIZE}
            radius="sm"
          />
          <View style={styles.rowText}>
            <SkeletonLine height={theme.font.size.xs} width="20%" />
            <SkeletonLine height={theme.font.size.sm} />
            <SkeletonLine height={theme.font.size.xs} width="40%" />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  header: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
