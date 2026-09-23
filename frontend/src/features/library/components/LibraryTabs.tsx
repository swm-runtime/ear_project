import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import GlassSurface from '@/shared/ui/GlassSurface';
import SegmentedControl from '@/shared/ui/SegmentedControl';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryFilter } from '../library.types';
import FilterIcon from './FilterIcon';

// 출처(이어 PICK·담은 콘텐츠)는 탭이 아니라 필터 팝업으로 이동했다(FE 개편 2026-08-07)
const TABS: LibraryFilter[] = ['all', 'unplayed', 'completed'];

const FILTER_ICON_SIZE = 20;
/** 유리 원 버튼 지름 — 세그먼트 트랙 높이(36)와 같은 눈높이 */
const FILTER_CIRCLE_SIZE = 36;
/** 칸 폭 — '미청취' 세 글자가 들어가는 폭. 세 칸 같은 폭(SegmentedControl) */
const SEGMENT_WIDTH = 64;
const OPTIONS = TABS.map((value) => ({ value, label: LIBRARY_COPY.tab[value] }));

interface LibraryTabsProps {
  filter: LibraryFilter;
  onChange: (filter: LibraryFilter) => void;
  /** 적용 중인 주제 필터 개수 — 0이면 배지를 그리지 않는다(library-uiux.md 4.2) */
  topicFilterCount: number;
  onFilterPress: () => void;
}

/**
 * 상단 상태 세그먼트(전체·미청취·완청) + 주제 필터 아이콘(library-uiux.md 4.2).
 *
 * 밑줄 탭 3분할이었던 것을 **세그먼트 컨트롤**로 바꿨다(2026-09-23 PM — HIG: 배타적인 몇 개 뷰를 같은 자리에서
 * 바꿀 땐 세그먼트. 탐색의 주간·월간·전체와 같은 부품). 구분선도 뺐다 — 캡슐이 스스로 경계다.
 * **필터는 탭이 아니라 다른 축이므로 글자가 아닌 아이콘으로 둔다** — 같은 글자로 두면
 * 상태 탭 옆에 네 번째 칸처럼 읽힌다.
 */
export default function LibraryTabs({
  filter,
  onChange,
  topicFilterCount,
  onFilterPress,
}: LibraryTabsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.segmentRow}>
        <SegmentedControl
          options={OPTIONS}
          value={filter}
          onChange={onChange}
          accessibilityLabel="상태 필터"
          segmentWidth={SEGMENT_WIDTH}
        />
      </View>
      <Pressable
        style={styles.filterButton}
        onPress={onFilterPress}
        accessibilityRole="button"
        accessibilityLabel={
          topicFilterCount > 0 ? LIBRARY_COPY.topicFilter.a11yBadge(topicFilterCount) : '주제 필터'
        }
      >
        {/* 유리 원 버튼(iOS 26 툴바 버튼처럼, PM 2026-09-23) — 세그먼트 트랙과 같은 재질·윤곽 */}
        <View style={styles.filterCircle}>
          <GlassSurface style={[StyleSheet.absoluteFill, styles.filterGlass]} />
          <View style={styles.filterCircleBorder} pointerEvents="none" />
          <FilterIcon
            size={FILTER_ICON_SIZE}
            color={topicFilterCount > 0 ? theme.color.primary : theme.color.textSecondary}
          />
        </View>
        {/* 배지는 아이콘 위에 얹는다 — 옆에 두면 적용될 때 버튼이 넓어져 탭 폭이 흔들린다 */}
        {topicFilterCount > 0 ? (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeLabel}>
              {topicFilterCount > 9 ? '9+' : topicFilterCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
    paddingLeft: theme.spacing.md,
    backgroundColor: theme.color.background,
  },
  // 세그먼트는 왼쪽에, 필터 아이콘은 오른쪽 끝에
  segmentRow: {
    flex: 1,
  },
  filterButton: {
    width: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCircle: {
    width: FILTER_CIRCLE_SIZE,
    height: FILTER_CIRCLE_SIZE,
    borderRadius: FILTER_CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterGlass: {
    borderRadius: FILTER_CIRCLE_SIZE / 2,
    overflow: 'hidden',
  },
  filterCircleBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: FILTER_CIRCLE_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.10)',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.onPrimary,
    fontWeight: '700',
  },
});
