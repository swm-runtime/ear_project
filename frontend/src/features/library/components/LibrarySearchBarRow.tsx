import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';

interface LibrarySearchBarRowProps {
  query: string;
  onChangeQuery: (query: string) => void;
  /** 검색창 줄 우측의 잔여 재생 표시 자리. null이면 자리를 비운다 */
  trailing: ReactNode;
}

/**
 * 라이브러리 검색창 줄 — 탐색의 검색창 줄과 같은 모양이지만 **여기서 바로 입력받는다.**
 * 탐색은 서버 검색이라 전용 화면(E6)으로 넘기지만, 라이브러리는 이미 받아 둔 목록을
 * 그 자리에서 좁히는 것이라 화면을 옮길 이유가 없다(2026-09-02).
 */
export default function LibrarySearchBarRow({
  query,
  onChangeQuery,
  trailing,
}: LibrarySearchBarRowProps) {
  const hasQuery = query.length > 0;

  return (
    <View style={styles.row}>
      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChangeQuery}
          placeholder={LIBRARY_COPY.search.placeholder}
          placeholderTextColor={theme.color.textSecondary}
          accessibilityRole="search"
          accessibilityLabel={LIBRARY_COPY.search.placeholder}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
        />
        {/* iOS 기본 지우기 버튼은 안드로이드에 없다 — 두 플랫폼에서 같게 보이도록 직접 둔다 */}
        {hasQuery ? (
          <Pressable
            style={styles.clearButton}
            onPress={() => onChangeQuery('')}
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.search.clearA11y}
          >
            <Text style={styles.clearGlyph}>✕</Text>
          </Pressable>
        ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight - theme.spacing.xs,
    paddingLeft: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  input: {
    flex: 1,
    // 고정 높이를 주지 않는다 — 동적 텍스트 200%에서 글자가 잘린다(uiux 7)
    paddingVertical: theme.spacing.xs,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  clearButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight - theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearGlyph: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
