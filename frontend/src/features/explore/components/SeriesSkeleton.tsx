import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { theme } from '@/shared/theme';
import { SkeletonBlock, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';

import { SERIES_EPISODE_NUMBER_GAP, SERIES_EPISODE_NUMBER_WIDTH } from './SeriesEpisodeRow';
import { seriesCoverSize } from './SeriesHeader';

/** 편 행 자리 수 — 첫 화면에 보이는 몫 */
const ROW_COUNT = 4;

/**
 * E14 로딩 스켈레톤 — 머리(큰 표지·제목·메타 줄)와 번호 트랙 행 자리만 실제 치수로 그린다(design.md §5 스켈레톤).
 * 0.3초 미만 미표시(useDelayedVisible)는 화면이 담당한다
 */
export default function SeriesSkeleton() {
  const { width } = useWindowDimensions();
  const coverSize = seriesCoverSize(width);
  return (
    <SkeletonGroup style={styles.root}>
      <View style={styles.header}>
        <SkeletonBlock width={coverSize} height={coverSize} radius="md" />
        <SkeletonLine height={24} width="60%" />
        {/* 카테고리(대표 중분류) 줄 자리 — 제목과 메타 사이 */}
        <SkeletonLine height={theme.font.size.md} width="35%" />
        <SkeletonLine height={theme.font.size.sm} width="40%" />
        <SkeletonBlock width={200} height={52} radius="full" style={styles.playSlot} />
      </View>
      {Array.from({ length: ROW_COUNT }, (_, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.numberCell} />
          <View style={styles.rowText}>
            <SkeletonLine height={theme.font.size.md} />
            <SkeletonLine height={theme.font.size.xs} width="30%" />
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
    paddingTop: theme.spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SERIES_EPISODE_NUMBER_GAP,
    paddingVertical: theme.spacing.sm + 2,
  },
  // 머리 [재생] 알약 자리 — 메타 줄과의 간격(lg)을 맞춘다
  playSlot: {
    marginTop: theme.spacing.md,
  },
  numberCell: {
    width: SERIES_EPISODE_NUMBER_WIDTH,
  },
  rowText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
