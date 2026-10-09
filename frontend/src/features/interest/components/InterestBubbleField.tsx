import { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';

import InterestBubble, { SCALE_DIMMED, SCALE_SELECTED } from './InterestBubble';
import { bubbleSize, layoutBubbles } from '../services/bubble-layout';

interface BubbleTopic {
  topicId: string;
  name: string;
  isSelected: boolean;
}

interface InterestBubbleFieldProps {
  topics: BubbleTopic[];
  /** 상한까지 다 골랐는가 — 남은 주제를 흐린다(탭은 받는다) */
  isFull: boolean;
  onToggle: (topicId: string) => void;
}

const SKELETON_COUNT = 9;

/**
 * 관심 주제 버블 밭 — 원들이 빈틈 6pt 만 두고 붙어 있고, 고른 버블이 커지면 이웃이 밀려난다
 * (PM 2026-10-09 23:02). 자리는 bubble-layout 이 계산하고, 버블은 그 자리로 스프링 이동한다(transform).
 * 밭의 높이만 레이아웃이고 선택이 바뀔 때 한 번 바뀐다. 스크롤은 부모가 한다.
 */
export function InterestBubbleField({ topics, isFull, onToggle }: InterestBubbleFieldProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const selectionKey = topics.map((topic) => (topic.isSelected ? '1' : '0')).join('');
  const layout = useMemo(
    () =>
      layoutBubbles(
        topics.map((topic, index) => ({
          size: bubbleSize(index, width),
          scale: topic.isSelected ? SCALE_SELECTED : isFull ? SCALE_DIMMED : 1,
        })),
        width,
      ),
    // 선택 모양(selectionKey)·개수·상한·폭이 같으면 같은 자리다 — topics 배열 정체성은 렌더마다 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectionKey, topics.length, isFull, width],
  );

  return (
    <View style={{ width, height: layout.height }}>
      {topics.map((topic, index) => {
        const place = layout.places[index];
        return (
          <InterestBubble
            key={topic.topicId}
            name={topic.name}
            size={bubbleSize(index, width)}
            cx={place.cx}
            cy={place.cy}
            isSelected={topic.isSelected}
            isDimmed={isFull && !topic.isSelected}
            index={index}
            reduceMotion={reduceMotion}
            onPress={() => onToggle(topic.topicId)}
          />
        );
      })}
    </View>
  );
}

/** IM9 스켈레톤 — 같은 벌집 자리에 회색 원. 스피너를 가운데 띄우지 않는다(uiux 4.7) */
export function InterestBubbleSkeleton() {
  const { width } = useWindowDimensions();
  const sizes = Array.from({ length: SKELETON_COUNT }, (_, index) => bubbleSize(index, width));
  const layout = layoutBubbles(
    sizes.map((size) => ({ size, scale: 1 })),
    width,
  );
  return (
    <SkeletonGroup style={{ width, height: layout.height }}>
      {layout.places.map((place, index) => (
        <SkeletonBlock
          key={index}
          style={[
            styles.slot,
            {
              left: place.cx - sizes[index] / 2,
              top: place.cy - sizes[index] / 2,
              width: sizes[index],
              height: sizes[index],
              borderRadius: sizes[index] / 2,
            },
          ]}
        />
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
  },
});
