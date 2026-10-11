import { useEffect, useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { topicImageSource } from '@/features/interest';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreTopic } from '../explore.types';

interface TopicChipsProps {
  topics: ExploreTopic[];
  selectedTopicIds: string[];
  onToggle: (topicId: string) => void;
  /**
   * 칩 줄의 가로 위치를 담아 두는 곳(화면이 소유) — 칩을 고르거나 풀면 화면이 피드 ↔ 격자로 바뀌며 이 줄이 새로 그려진다.
   * 위치를 여기 두고 새로 그려질 때 되돌린다(PM 2026-10-09 "뒤 알약을 골랐다 풀면 맨 앞으로 온다")
   */
  offsetRef?: { current: number };
}

/**
 * 주제 칩 줄 — 관심 주제가 앞쪽에 오는 순서는 서버가 정한다(explore.md 4.2).
 * **하나만 고르는 토글**이다(PM 2026-10-09, 종전 다중 선택 OR) — 다른 칩을 누르면 전환, 고른 칩을 다시 누르면 해제.
 * 선택이 생기면 화면이 단일 목록으로 전환된다.
 *
 * 시각은 **온보딩·관심사 칩과 같은 사진 알약**이다(PM 2026-09-27 19:17 "온보딩 페이지에 배경 넣은 것처럼
 * 채워 넣자") — 주제 사진 + 어두운 막 + 흰 라벨, 선택하면 막이 짙어진다. 사진은 `@/features/interest` 의
 * `topicImageSource`(주제 **이름**으로 찾는다 — id 는 mock 과 서버가 다르다)를 쓰고, 프로필의 관심 주제
 * 카드도 같은 방식이다. 종전엔 흰 테두리 알약 / 선택 시 검정 채움이었다.
 */
export default function TopicChips({
  topics,
  selectedTopicIds,
  onToggle,
  offsetRef,
}: TopicChipsProps) {
  /*
   * **고른 칩이 화면 밖이면 보이게 민다**(PM 2026-10-09 — 칩을 고르면 화면이 격자로 바뀌며 칩 줄이 새로 그려져 맨 앞부터
   * 보여, 뒤쪽 칩을 고르면 무엇이 골라졌는지 안 보였다). 새로 그려질 땐 애니메이션 없이, 이미 있는 줄에서 바뀌면 부드럽게.
   * 이미 다 보이면 움직이지 않는다
   */
  const scrollRef = useRef<ScrollView>(null);
  const chipBoxes = useRef<Record<string, { x: number; width: number }>>({});
  const viewport = useRef({ offset: 0, width: 0, contentWidth: 0 });
  const revealedId = useRef<string | null>(null);
  /** 새로 그려진 뒤 담아 둔 위치로 돌아갔는가 — 돌아가기 전에 고른 칩을 밀면 되돌리기가 그걸 덮는다 */
  const isRestored = useRef(false);
  const selectedId = selectedTopicIds[0] ?? null;
  const reveal = (id: string, animated: boolean) => {
    const box = chipBoxes.current[id];
    const { offset, width } = viewport.current;
    if (!box || width === 0) return;
    revealedId.current = id;
    const margin = theme.spacing.md;
    if (box.x - margin < offset) {
      scrollRef.current?.scrollTo({ x: Math.max(0, box.x - margin), animated });
    } else if (box.x + box.width + margin > offset + width) {
      scrollRef.current?.scrollTo({ x: box.x + box.width + margin - width, animated });
    }
  };
  /** 크기를 다 알면 담아 둔 위치로 돌아간 뒤, 고른 칩이 밖이면 민다(레이아웃 이벤트 순서가 일정하지 않아 셋 다 여기로 모은다) */
  const settle = () => {
    const { width, contentWidth } = viewport.current;
    if (width === 0 || contentWidth === 0) return;
    if (!isRestored.current) {
      isRestored.current = true;
      const x = Math.min(offsetRef?.current ?? 0, Math.max(0, contentWidth - width));
      viewport.current.offset = x;
      scrollRef.current?.scrollTo({ x, animated: false });
    }
    if (selectedId !== null && revealedId.current !== selectedId) reveal(selectedId, false);
  };
  useEffect(() => {
    if (selectedId === null) revealedId.current = null;
    else if (isRestored.current && revealedId.current !== selectedId) reveal(selectedId, true);
  });

  if (topics.length === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(event) => {
        viewport.current.offset = event.nativeEvent.contentOffset.x;
        if (offsetRef && isRestored.current) offsetRef.current = event.nativeEvent.contentOffset.x;
      }}
      onLayout={(event) => {
        viewport.current.width = event.nativeEvent.layout.width;
        settle();
      }}
      onContentSizeChange={(contentWidth) => {
        viewport.current.contentWidth = contentWidth;
        settle();
      }}
      // ScrollView 기본값이 flexGrow: 1이라 본문이 비는 순간 칩 줄이 세로로 늘어난다 — 성장 금지
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {topics.map((topic) => {
        const isSelected = selectedTopicIds.includes(topic.id);
        // 무언가 골랐으면 나머지 칩을 흐린다 — 고른 칩만 제 색으로 남는다
        const isDimmed = selectedId !== null && !isSelected;
        return (
          <Pressable
            key={topic.id}
            style={[styles.chip, isDimmed && styles.chipDimmed]}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              chipBoxes.current[topic.id] = { x, width };
              if (topic.id === selectedId) settle();
            }}
            onPress={() => onToggle(topic.id)}
            accessibilityRole="togglebutton"
            accessibilityLabel={topic.name}
            accessibilityHint={EXPLORE_COPY.chips.a11yHint}
            accessibilityState={{ checked: isSelected }}
          >
            <Image source={topicImageSource(topic.name)} resizeMode="cover" style={styles.photo} />
            {/*
              선택 표시는 **나머지 칩을 흐리는 것**이다(PM 2026-10-09) — 고른 칩의 막을 짙게 하던 방식은 사진이 원래 어두운 칩
              (경제 상식·투자·IT·개발)에서 차이가 보이지 않았다. 체크 글리프는 두지 않는다. 낭독은 위 accessibilityState 가 한다
            */}
            <View style={styles.overlay} />
            <Text style={styles.label} numberOfLines={1}>
              {topic.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 주제를 골랐을 때 나머지 칩의 불투명도 */
const UNSELECTED_OPACITY = 0.4;

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
    borderCurve: 'continuous',
    overflow: 'hidden',
    /*
     * **패딩을 칩이 갖지 않는다.** 배경 사진의 `width/height: '100%'` 가 부모의 콘텐츠 박스(패딩 제외)로
     * 풀려서, 칩에 패딩이 있으면 알약 가장자리에 배경이 드러난다(TopicChip 이 iOS 실기기에서 겪은 것).
     * 좌우 여백은 아래 `label` 이 갖는다
     */
  },
  // 다른 주제를 골랐을 때 — 사진 밝기와 무관하게 고른 칩이 튄다
  chipDimmed: {
    opacity: UNSELECTED_OPACITY,
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
  label: {
    // 칩이 아니라 라벨이 좌우 여백을 갖는다 — 위 chip 주석 참고
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.sm,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 칩 폭이 변해
    // 뒤쪽 칩들이 옆으로 밀리고, 여러 개를 연속으로 고르는 동안 표적이 움직인다
    // (features/interest/components/TopicChip.tsx도 같은 이유로 고정돼 있다)
    fontWeight: '700',
    color: theme.color.onPhoto,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
