import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { SkeletonBlock, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';

/**
 * CD3 로딩 스켈레톤 — 헤더(썸네일·제목 2줄)·메타 자리만 그린다(content-detail-uiux.md 4.7).
 * 액션 버튼은 그리지 않는다 — 담김 여부를 모르는 상태에서 어느 쪽도 그릴 수 없다.
 * 0.3초 미만 미표시(useDelayedVisible)는 화면이 담당한다.
 */
export default function ContentDetailSkeleton() {
  return (
    <SkeletonGroup style={styles.root}>
      <View style={styles.header}>
        <SkeletonBlock width={72} height={72} radius="md" />
        <View style={styles.headerText}>
          <SkeletonLine height={theme.font.size.md} />
          <SkeletonLine height={theme.font.size.md} width="60%" />
        </View>
      </View>
      <View style={styles.metaBlock}>
        <SkeletonLine height={theme.font.size.sm} width="70%" />
        <SkeletonLine height={theme.font.size.sm} width="70%" />
        <SkeletonLine height={theme.font.size.sm} width="70%" />
      </View>
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
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  metaBlock: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
});
