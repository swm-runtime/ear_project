import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryFilter } from '../library.types';

// 출처(이어 PICK·담은 콘텐츠)는 탭이 아니라 필터 팝업으로 이동했다(FE 개편 2026-08-07)
const TABS: LibraryFilter[] = ['all', 'unplayed', 'completed'];

interface LibraryTabsProps {
  filter: LibraryFilter;
  onChange: (filter: LibraryFilter) => void;
  /** 적용 중인 주제 필터 개수 — 0이면 배지를 그리지 않는다(library-uiux.md 4.2) */
  topicFilterCount: number;
  onFilterPress: () => void;
}

/**
 * 상단 탭 4개 + 주제 필터 아이콘(library-uiux.md 4.2).
 * 등폭 4분할·말줄임·축약을 쓰지 않는다 — 라벨 폭 + 고정 패딩, 넘치면 탭 줄만 가로 스크롤.
 */
export default function LibraryTabs({
  filter,
  onChange,
  topicFilterCount,
  onFilterPress,
}: LibraryTabsProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        accessibilityRole="tablist"
      >
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
      </ScrollView>
      <Pressable
        style={styles.filterButton}
        onPress={onFilterPress}
        accessibilityRole="button"
        accessibilityLabel={
          topicFilterCount > 0 ? LIBRARY_COPY.topicFilter.a11yBadge(topicFilterCount) : '주제 필터'
        }
      >
        <Text style={[styles.filterLabel, topicFilterCount > 0 && styles.filterLabelActive]}>
          필터
        </Text>
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
  tabRow: {
    paddingHorizontal: theme.spacing.sm,
  },
  tab: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
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
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  filterLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  filterLabelActive: {
    color: theme.color.primary,
    fontWeight: '700',
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  filterBadgeLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.onPrimary,
    fontWeight: '700',
  },
});
