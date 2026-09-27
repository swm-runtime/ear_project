import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { topicImageSource } from '@/features/interest';

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
 *
 * 시각은 **온보딩·관심사 칩과 같은 사진 알약**이다(PM 2026-09-27 19:17 "온보딩 페이지에 배경 넣은 것처럼
 * 채워 넣자") — 주제 사진 + 어두운 막 + 흰 라벨, 선택하면 막이 짙어진다. 사진은 `@/features/interest` 의
 * `topicImageSource`(주제 **이름**으로 찾는다 — id 는 mock 과 서버가 다르다)를 쓰고, 프로필의 관심 주제
 * 카드도 같은 방식이다. 종전엔 흰 테두리 알약 / 선택 시 검정 채움이었다.
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
            style={styles.chip}
            onPress={() => onToggle(topic.id)}
            accessibilityRole="togglebutton"
            accessibilityLabel={topic.name}
            accessibilityHint={EXPLORE_COPY.chips.a11yHint}
            accessibilityState={{ checked: isSelected }}
          >
            <Image source={topicImageSource(topic.name)} resizeMode="cover" style={styles.photo} />
            {/* 선택 표시는 짙어진 막이다 — 체크 글리프를 두지 않는다(온보딩 칩과 같다). 낭독은 위 accessibilityState 가 한다 */}
            <View style={[styles.overlay, isSelected && styles.overlaySelected]} />
            <Text style={styles.label} numberOfLines={1}>
              {topic.name}
            </Text>
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
    // 명세가 주제 칩을 콕 집어 44pt를 요구한다(explore-uiux.md 7) — 빼지 않는다
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    // 알약 — 사진·막 클리핑은 여기서 한 번만 한다(TopicChip·InterestCard 와 같은 구조)
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    /*
     * **패딩을 칩이 갖지 않는다.** 배경 사진의 `width/height: '100%'` 가 부모의 콘텐츠 박스(패딩 제외)로
     * 풀려서, 칩에 패딩이 있으면 알약 가장자리에 배경이 드러난다(TopicChip 이 iOS 실기기에서 겪은 것).
     * 좌우 여백은 아래 `label` 이 갖는다
     */
  },
  /** 배경 사진 — inset 과 퍼센트 크기를 함께 준다(웹에서 inset 만으로는 원본 800x320 이 남는다) */
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  /** 사진 위 가독성용 막 — 온보딩 칩의 기본값(0.34)과 같다 */
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  /** 선택 — 막만 짙어진다(온보딩 칩의 선택 상태와 같은 토큰) */
  overlaySelected: {
    backgroundColor: theme.color.photoScrim,
  },
  label: {
    // 칩이 아니라 라벨이 좌우 여백을 갖는다 — 위 chip 주석 참고
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.sm,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 칩 폭이 변해
    // 뒤쪽 칩들이 옆으로 밀리고, 여러 개를 연속으로 고르는 동안 표적이 움직인다
    // (features/interest/components/TopicChip.tsx도 같은 이유로 고정돼 있다)
    fontWeight: '700',
    color: theme.color.onPrimary,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
