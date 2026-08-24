import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';

interface ExploreSearchBarRowProps {
  /** 검색창 줄 우측의 잔여 재생 표시 자리(explore.md 4.4-1). null이면 자리를 비운다 */
  trailing: ReactNode;
  /** 검색창 탭 — 검색 화면(E6) 전환(explore.md 4.5-1) */
  onPress: () => void;
}

/**
 * 검색창 줄 — 검색은 MVP 포함이다(explore.md 4.5, 합의 2026-08-23 — 종전 "P1 유지·비활성
 * 노출" 폐기). 탭하면 검색 화면(E6)으로 전환하고 키보드가 올라온다. 입력은 검색 화면이
 * 받는다 — 이 줄은 진입점일 뿐이라 TextInput을 두지 않는다.
 */
export default function ExploreSearchBarRow({ trailing, onPress }: ExploreSearchBarRowProps) {
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.searchBox}
        onPress={onPress}
        accessibilityRole="search"
        accessibilityLabel={EXPLORE_COPY.search.placeholder}
      >
        <Text style={styles.placeholder}>{EXPLORE_COPY.search.placeholder}</Text>
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  searchBox: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight - theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  placeholder: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
