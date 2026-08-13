import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { RecommendedContent } from '../onboarding.types';

interface ContentPickCardProps {
  content: RecommendedContent;
  isSelected: boolean;
  onPress: () => void;
}

const formatDurationLabel = (durationSec: number): string =>
  `${Math.max(1, Math.round(durationSec / 60))}분`;

/**
 * 3단계 추천 카드. 탭은 선택이지 재생이 아니다 — 재생 버튼·미리듣기를 두지 않는다(onboarding-uiux.md 4.4).
 * 선택 표시는 테두리·배경 변화이며 체크 아이콘을 두지 않는다(onboarding-uiux.md 4.4 · 7장 예외).
 * 낭독기에는 role="checkbox" + checked로 전달한다.
 */
export default function ContentPickCard({ content, isSelected, onPress }: ContentPickCardProps) {
  return (
    <Pressable
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={`${content.title}, ${content.sourceName}, ${formatDurationLabel(content.durationSec)}`}
    >
      <Image source={{ uri: content.thumbnailUrl }} style={styles.thumbnail} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {content.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {content.sourceName} · {formatDurationLabel(content.durationSec)}
        </Text>
        {content.topics.length > 0 ? (
          <Text style={styles.topicBadge} numberOfLines={1}>
            {content.topics.map((topic) => topic.name).join(' · ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + theme.spacing.xs,
    padding: theme.spacing.sm + theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  cardSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.surface,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  topicBadge: {
    fontSize: theme.font.size.xs,
    color: theme.color.primary,
  },
});
