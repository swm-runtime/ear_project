import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreTopic } from '../explore.types';

interface SuggestedKeywordChipsProps {
  /** 주제 칩 목록(2-2) 응답 재사용 — 관심 주제 앞배치 정렬은 서버 소유다(explore-api.md 4.5) */
  topics: ExploreTopic[];
  onKeywordPress: (name: string) => void;
}

/**
 * E6 추천 키워드 — 주제 칩(TopicChips — 다중 선택 토글)과 역할이 다르다.
 * 탭 결과가 필터가 아니라 그 이름을 질의로 한 즉시 검색이라 버튼으로 읽힌다(uiux 7).
 */
export default function SuggestedKeywordChips({
  topics,
  onKeywordPress,
}: SuggestedKeywordChipsProps) {
  if (topics.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {EXPLORE_COPY.search.suggestedTitle}
      </Text>
      <View style={styles.chips}>
        {topics.map((topic) => (
          <Pressable
            key={topic.id}
            style={styles.chip}
            onPress={() => onKeywordPress(topic.name)}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.search.suggestedChipA11y(topic.name)}
          >
            <Text style={styles.chipLabel}>{topic.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.color.border,
    // 주제 칩(TopicChips)과 같은 시각 문법 — 역할(검색 실행)만 다르다
    backgroundColor: theme.color.background,
  },
  chipLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
