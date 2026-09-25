import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';

interface LibraryFilterSummaryProps {
  /** 적용 중인 조건 이름들(상태·출처·주제 순) — 비면 그리지 않는다 */
  conditions: string[];
  onPress: () => void;
}

/**
 * 검색줄 아래 한 줄 — 지금 목록에 걸린 필터를 그대로 적는다("미청취 · 재테크"). 상태 탭이 시트로 들어가면서
 * "지금 무엇을 보고 있나"가 화면에서 사라지지 않게(2026-09-25 PM). 탭하면 시트가 열린다
 */
export default function LibraryFilterSummary({ conditions, onPress }: LibraryFilterSummaryProps) {
  if (conditions.length === 0) return null;
  const text = conditions.join(' · ');
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={LIBRARY_COPY.topicFilter.summaryA11y(text)}
    >
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: theme.spacing.md + theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  text: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
});
