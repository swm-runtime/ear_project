import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

/** 행 스켈레톤 하나 — 썸네일 + 두 줄 텍스트 자리 */
function RowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={styles.thumbnail} />
      <View style={styles.info}>
        <View style={styles.lineWide} />
        <View style={styles.lineNarrow} />
      </View>
    </View>
  );
}

interface ExploreSkeletonProps {
  /** 필터 전환(단일 목록) 로딩에는 섹션 제목 자리를 그리지 않는다 — 행 스켈레톤만 */
  showSectionTitles?: boolean;
}

/**
 * E11 최초 로딩 — 섹션 제목 자리 + 행 스켈레톤 3개 묶음을 2세트(explore-uiux.md 4.9).
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
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
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
  row: {
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
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  lineWide: {
    height: theme.font.size.sm,
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
