import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';

interface RecentSearchListProps {
  searches: string[];
  /** 검색어 탭 — 그 검색어로 즉시 검색한다(explore.md 4.5-4) */
  onSearchPress: (query: string) => void;
  onDeletePress: (query: string) => void;
  onClearAll: () => void;
}

/**
 * E6 최근 검색어 — 기기 로컬 10건, 개별 ×·[전체 삭제](explore.md 4.5-4).
 * 검색어와 삭제 버튼이 각각 포커스를 받는다(uiux 7).
 */
export default function RecentSearchList({
  searches,
  onSearchPress,
  onDeletePress,
  onClearAll,
}: RecentSearchListProps) {
  if (searches.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title} accessibilityRole="header">
          {EXPLORE_COPY.search.recentTitle}
        </Text>
        <Pressable
          onPress={onClearAll}
          style={styles.clearAllButton}
          accessibilityRole="button"
          accessibilityLabel={EXPLORE_COPY.search.clearAll}
        >
          <Text style={styles.clearAllLabel}>{EXPLORE_COPY.search.clearAll}</Text>
        </Pressable>
      </View>
      {searches.map((query) => (
        <View key={query} style={styles.itemRow}>
          <Pressable
            style={styles.queryButton}
            onPress={() => onSearchPress(query)}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.search.recentItemA11y(query)}
          >
            <Text style={styles.queryLabel} numberOfLines={1}>
              {query}
            </Text>
          </Pressable>
          <Pressable
            style={styles.deleteButton}
            onPress={() => onDeletePress(query)}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.search.recentDeleteA11y(query)}
          >
            <Text style={styles.deleteGlyph}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  clearAllButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  clearAllLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queryButton: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  queryLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  deleteButton: {
    // 터치 타깃 최소 44pt(uiux 7) — 글리프는 작아도 히트 영역은 지킨다
    minWidth: theme.touchTarget.minHeight,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteGlyph: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
