import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreTopic } from '../explore.types';

interface TopicChipsProps {
  topics: ExploreTopic[];
  selectedTopicIds: string[];
  onToggle: (topicId: string) => void;
}

/**
 * 주제 칩 줄 — 관심 주제가 앞쪽에 오는 순서는 서버가 정한다(explore.md 4.2).
 * 다중 선택 토글(OR 조합)이며, 선택이 생기면 화면이 단일 목록으로 전환된다.
 */
export default function TopicChips({ topics, selectedTopicIds, onToggle }: TopicChipsProps) {
  if (topics.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // ScrollView 기본값이 flexGrow: 1이라 본문이 비는 순간 칩 줄이 세로로 늘어난다 — 성장 금지
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {topics.map((topic) => {
        const isSelected = selectedTopicIds.includes(topic.id);
        return (
          <Pressable
            key={topic.id}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => onToggle(topic.id)}
            accessibilityRole="togglebutton"
            accessibilityLabel={topic.name}
            accessibilityHint={EXPLORE_COPY.chips.a11yHint}
            accessibilityState={{ checked: isSelected }}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>{topic.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    // ScrollView 기본값(flexGrow·flexShrink 1)대로면 본문 크기에 따라 칩 줄이 늘거나 찌그러진다
    flexGrow: 0,
    flexShrink: 0,
  },
  container: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chip: {
    minHeight: theme.touchTarget.minHeight - theme.spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  chipSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.primary,
  },
  label: {
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  labelSelected: {
    color: theme.color.onPrimary,
    fontWeight: '600',
  },
});
