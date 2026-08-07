import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';

interface ExploreSearchBarRowProps {
  /** 검색창 줄 우측의 잔여 재생 표시 자리(explore.md 4.4-1). null이면 자리를 비운다 */
  trailing: ReactNode;
}

/**
 * 검색창 줄 — MVP에서 검색창은 비활성 상태로 노출한다(explore.md 4.5, 합의 2026-08-06).
 * 탭해도 아무 반응이 없고, 비활성임을 시각(톤 낮춤)과 스크린리더(disabled)로 드러낸다.
 * P1 활성화 시 같은 자리에서 검색 화면 전환이 켜진다.
 */
export default function ExploreSearchBarRow({ trailing }: ExploreSearchBarRowProps) {
  return (
    <View style={styles.row}>
      <View
        style={styles.searchBox}
        accessibilityRole="search"
        accessibilityLabel={EXPLORE_COPY.search.placeholder}
        accessibilityState={{ disabled: true }}
      >
        <Text style={styles.placeholder}>{EXPLORE_COPY.search.placeholder}</Text>
      </View>
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
    // 비활성 톤 — 활성 검색창과 같은 모양이면 탭 무반응이 오류로 읽힌다(explore-uiux.md 4.1)
    opacity: 0.6,
  },
  placeholder: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
