import { Image, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { topicImageSource } from '@/features/interest';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreTopic } from '../explore.types';

interface SuggestedKeywordChipsProps {
  /** 주제 칩 목록(2-2) 응답 재사용 — 관심 주제 앞배치 정렬은 서버 소유다(explore-api.md 4.5) */
  topics: ExploreTopic[];
  onKeywordPress: (name: string) => void;
}

/**
 * E6 추천 키워드 — 주제 칩(TopicChips — 하나만 고르는 토글)과 역할이 다르다.
 * 탭 결과가 필터가 아니라 그 이름을 질의로 한 즉시 검색이라 버튼으로 읽힌다(uiux 7).
 *
 * **시각은 주제 칩과 같다**(사진 알약 — design.md 주제 칩 절, PM 2026-09-27 19:25). 목록이 주제 칩과 같은
 * 응답이라 이름으로 찾는 사진이 그대로 맞는다. 선택 상태가 없으므로 막은 기본값(0.34) 하나뿐이다
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
            <Image source={topicImageSource(topic.name)} resizeMode="cover" style={styles.photo} />
            <View style={styles.overlay} />
            <Text style={styles.chipLabel} numberOfLines={1}>
              {topic.name}
            </Text>
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
  // 주제 칩(TopicChips)과 같은 시각 문법 — 역할(검색 실행)만 다르다. 구조 규칙도 같다:
  // 클리핑은 알약이 한 번만 · 칩에 패딩을 주지 않고 라벨이 좌우 여백을 가짐 · 사진은 inset+퍼센트 둘 다
  chip: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  /** 사진 위 가독성용 막 — 주제 칩의 기본값과 같다(선택 상태가 없어 짙은 변형은 없다) */
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  chipLabel: {
    // 칩이 아니라 라벨이 좌우 여백을 갖는다 — 위 chip 주석 참고
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.onPrimary,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
