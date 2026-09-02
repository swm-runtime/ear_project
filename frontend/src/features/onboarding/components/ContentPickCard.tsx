import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { RecommendedContent } from '../onboarding.types';

interface ContentPickCardProps {
  content: RecommendedContent;
  isSelected: boolean;
  onPress: () => void;
}

/** 아트워크 한 변 — 스켈레톤이 같은 높이를 잡는 데 쓴다 */
export const PICK_CARD_THUMBNAIL = 72;

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
        <Text style={styles.title} numberOfLines={1}>
          {content.title}
        </Text>
        {/*
          제목 → 출처·저자 → 시간 세 줄(2026-09-02). 라이브러리 카드는 한 줄로 붙이지만
          이 화면은 카드가 선택 대상이라 길이가 눈에 먼저 들어와야 한다 — 줄을 나눈다.
          시간의 글자 크기·색은 라이브러리 카드의 메타와 같다
        */}
        <Text style={styles.meta} numberOfLines={1}>
          {content.sourceName} · {content.authorName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatDurationLabel(content.durationSec)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /*
   * 라이브러리·탐색의 세로 카드와 같은 크기·문법(2026-09-02). 다른 점은 둘이다 —
   * 더보기(⋯)가 없고(탭이 선택이라 부가 동작이 없다), 선택 상태를 테두리·배경으로 말한다.
   */
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    // 미선택도 카드 배경을 깐다 — 테두리는 자리만 잡고 보이지 않는다
    borderColor: theme.color.surface,
    backgroundColor: theme.color.surface,
  },
  // 고른 것은 채움을 빼고 테두리를 세운다 — 회색 카드 사이에서 흰 카드가 떠오른다
  cardSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.background,
  },
  thumbnail: {
    width: PICK_CARD_THUMBNAIL,
    height: PICK_CARD_THUMBNAIL,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.background,
  },
  body: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
