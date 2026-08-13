import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryFilter } from '../library.types';
import FilterIcon from './FilterIcon';

// 출처(이어 PICK·담은 콘텐츠)는 탭이 아니라 필터 팝업으로 이동했다(FE 개편 2026-08-07)
const TABS: LibraryFilter[] = ['all', 'unplayed', 'completed'];

const FILTER_ICON_SIZE = 22;

interface LibraryTabsProps {
  filter: LibraryFilter;
  onChange: (filter: LibraryFilter) => void;
  /** 적용 중인 주제 필터 개수 — 0이면 배지를 그리지 않는다(library-uiux.md 4.2) */
  topicFilterCount: number;
  onFilterPress: () => void;
}

/**
 * 상단 상태 탭 3개 + 주제 필터 아이콘(library-uiux.md 4.2).
 *
 * **탭은 등폭 3분할이다.** 라벨이 전부 2–3자라 360dp에서 탭 하나가 90dp 이상 확보된다
 * (2026-08-07 개편으로 [이어 PICK]이 필터 시트로 빠지면서 폭 문제가 없어졌다).
 * **필터는 탭이 아니라 다른 축이므로 글자가 아닌 아이콘으로 둔다** — 같은 글자로 두면
 * 상태 탭 옆에 네 번째 탭처럼 읽힌다.
 */
export default function LibraryTabs({
  filter,
  onChange,
  topicFilterCount,
  onFilterPress,
}: LibraryTabsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.tabRow} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const isSelected = tab === filter;
          return (
            <Pressable
              key={tab}
              style={[styles.tab, isSelected && styles.tabSelected]}
              onPress={() => onChange(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={LIBRARY_COPY.tab[tab]}
            >
              <Text style={[styles.tabLabel, isSelected && styles.tabLabelSelected]}>
                {LIBRARY_COPY.tab[tab]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        style={styles.filterButton}
        onPress={onFilterPress}
        accessibilityRole="button"
        accessibilityLabel={
          topicFilterCount > 0 ? LIBRARY_COPY.topicFilter.a11yBadge(topicFilterCount) : '주제 필터'
        }
      >
        <FilterIcon
          size={FILTER_ICON_SIZE}
          color={topicFilterCount > 0 ? theme.color.primary : theme.color.textSecondary}
        />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  // 등폭 3분할 — 라벨 폭에 맡기면 탭이 왼쪽에 몰리고 우측 필터가 네 번째 탭처럼 보인다
  tabRow: {
    flex: 1,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: {
    borderBottomColor: theme.color.primary,
  },
  tabLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  tabLabelSelected: {
    color: theme.color.textPrimary,
    fontWeight: '700',
  },
  filterButton: {
    width: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
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
