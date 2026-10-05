import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { SkeletonBlock, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';

import { EXPLORE_TILE_WIDTH } from './ExploreTile';

/** 두 칸 격자(주제 필터 결과·검색 결과)의 한 행 스켈레톤 — 정사각 아트워크 + 두 줄 텍스트 자리 × 2 */
function GridRowSkeleton() {
  return (
    <View style={styles.gridRow}>
      {[0, 1].map((index) => (
        <View key={index} style={styles.gridTile}>
          <SkeletonBlock radius="lg" style={styles.gridArtwork} />
          <SkeletonLine height={theme.font.size.md} />
          <SkeletonLine height={theme.font.size.xs} width="55%" />
        </View>
      ))}
    </View>
  );
}

/** 가로 캐러셀의 타일 스켈레톤 — 정사각 아트워크 + 제목 두 줄 자리 */
function TileSkeleton() {
  return (
    <View style={styles.tile}>
      <SkeletonBlock width={EXPLORE_TILE_WIDTH} height={EXPLORE_TILE_WIDTH} radius="md" />
      <SkeletonLine height={theme.font.size.md} />
      <SkeletonLine height={theme.font.size.xs} width="55%" />
    </View>
  );
}

interface ExploreSkeletonProps {
  /** 필터 전환·검색 결과(단일 격자) 로딩에는 섹션 제목 자리를 그리지 않는다 — 격자 행 스켈레톤만 */
  showSectionTitles?: boolean;
}

/**
 * E11 최초 로딩 — 섹션 제목 자리 + 가로 타일 묶음을 2세트(explore-uiux.md 4.9).
 * 검색창·주제 칩 줄 자리는 화면이 실컴포넌트로 잡아 둔다. 잔여 표시는 스켈레톤조차 그리지 않는다.
 * 콘텐츠 목록 영역(flex) 안에서만 그려지고, 넘치는 만큼은 잘라낸다 — 상단 줄을 밀지 않는다.
 * 첫 검색 로딩(explore-uiux.md 4.6)도 격자 행 판(`showSectionTitles={false}`)을 그대로 쓴다 — 결과가 같은 격자다.
 */
export default function ExploreSkeleton({ showSectionTitles = true }: ExploreSkeletonProps) {
  return (
    <SkeletonGroup style={styles.root}>
      {[0, 1].map((sectionIndex) => (
        <View key={sectionIndex} style={styles.section}>
          {showSectionTitles ? (
            <SkeletonLine width={140} height={theme.font.size.lg} style={styles.sectionTitle} />
          ) : null}
          {showSectionTitles ? (
            // 실제 캐러셀과 같은 배치여야 로딩이 끝날 때 목록이 튀지 않는다
            <View style={styles.carousel}>
              <TileSkeleton />
              <TileSkeleton />
              <TileSkeleton />
            </View>
          ) : (
            <GridRowSkeleton />
          )}
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  section: {
    paddingTop: theme.spacing.md,
  },
  sectionTitle: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  carousel: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  tile: {
    width: EXPLORE_TILE_WIDTH,
    gap: theme.spacing.sm,
  },
  // 주제 필터 결과의 격자(ExploreScreen gridContent·gridRow)와 같은 크기·간격
  gridRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm * 1.5,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  gridTile: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  gridArtwork: {
    width: '100%',
    aspectRatio: 1,
  },
});
