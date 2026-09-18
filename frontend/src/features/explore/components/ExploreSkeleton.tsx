import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_TILE_WIDTH } from './ExploreTile';

/** 두 칸 격자(주제 필터 결과)의 한 행 스켈레톤 — 정사각 아트워크 + 두 줄 텍스트 자리 × 2 */
function GridRowSkeleton() {
  return (
    <View style={styles.gridRow}>
      {[0, 1].map((index) => (
        <View key={index} style={styles.gridTile}>
          <View style={styles.gridArtwork} />
          <View style={styles.lineWide} />
          <View style={styles.lineNarrow} />
        </View>
      ))}
    </View>
  );
}

/** 가로 캐러셀의 타일 스켈레톤 — 정사각 아트워크 + 제목 두 줄 자리 */
function TileSkeleton() {
  return (
    <View style={styles.tile}>
      <View style={styles.tileArtwork} />
      <View style={styles.lineWide} />
      <View style={styles.lineNarrow} />
    </View>
  );
}

interface ExploreSkeletonProps {
  /** 필터 전환(단일 목록) 로딩에는 섹션 제목 자리를 그리지 않는다 — 격자 행 스켈레톤만 */
  showSectionTitles?: boolean;
}

/**
 * E11 최초 로딩 — 섹션 제목 자리 + 가로 타일 묶음을 2세트(explore-uiux.md 4.9).
 * 검색창·주제 칩 줄 자리는 화면이 실컴포넌트로 잡아 둔다. 잔여 표시는 스켈레톤조차 그리지 않는다.
 * 콘텐츠 목록 영역(flex) 안에서만 그려지고, 넘치는 만큼은 잘라낸다 — 상단 줄을 밀지 않는다.
 */
export default function ExploreSkeleton({ showSectionTitles = true }: ExploreSkeletonProps) {
  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1].map((sectionIndex) => (
        <View key={sectionIndex} style={styles.section}>
          {showSectionTitles ? <View style={styles.sectionTitle} /> : null}
          {showSectionTitles ? (
            // 실제 캐러셀과 같은 배치여야 로딩이 끝날 때 목록이 튀지 않는다
            <View style={styles.carousel}>
              <TileSkeleton />
              <TileSkeleton />
              <TileSkeleton />
            </View>
          ) : (
            <>
              <GridRowSkeleton />
            </>
          )}
        </View>
      ))}
    </View>
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
    width: 140,
    height: theme.font.size.lg,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
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
  tileArtwork: {
    width: EXPLORE_TILE_WIDTH,
    height: EXPLORE_TILE_WIDTH,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
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
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  lineWide: {
    height: theme.font.size.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    alignSelf: 'stretch',
  },
  lineNarrow: {
    height: theme.font.size.xs,
    width: '55%',
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
});
