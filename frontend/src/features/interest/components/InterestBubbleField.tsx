import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';

import InterestBubble from './InterestBubble';

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

/** 시안(폭 390) 기준 값 — 화면 폭에 비례해 줄인다 */
const DESIGN_WIDTH = 390;
/** 줄 간격 */
const ROW_PITCH = 104;
const TOP_PADDING = 78;
const BOTTOM_PADDING = 64;
/** 지름 무늬 — 크기가 섞여야 흩뿌린 느낌이 난다. 주제 순서대로 돌려 쓴다 */
const DIAMETERS = [100, 110, 92, 104, 96, 112, 98, 90, 108, 94, 104, 110, 92, 104, 98, 102];
/** 중심점 흔들림 — 결정적 값이라 다시 들어와도 같은 배치다 */
const JITTER_X = [-4, 6, -2, 5, -6, 3, 4, -5, 2, -3, 6, -4, 3, -2, 5, -6];
const JITTER_Y = [4, -6, 2, -3, 5, -2, -4, 6, -5, 3, -2, 4, -6, 2, 5, -3];
/** 3개 줄과 2개 줄이 번갈아 엇갈린다(벌집) — 가로 위치는 폭에 대한 비율 */
const ROW_OF_THREE = [0.18, 0.5, 0.82];
const ROW_OF_TWO = [0.34, 0.66];
const SKELETON_COUNT = 8;

interface Placement {
  left: number;
  top: number;
  size: number;
}

/** i 번째 주제의 자리 — 3·2·3·2… 줄을 채워 간다 */
const placeAll = (count: number, width: number): { places: Placement[]; height: number } => {
  const scale = width / DESIGN_WIDTH;
  const places: Placement[] = [];
  let row = 0;
  while (places.length < count) {
    const columns = row % 2 === 0 ? ROW_OF_THREE : ROW_OF_TWO;
    for (const ratio of columns) {
      if (places.length >= count) break;
      const i = places.length;
      const size = DIAMETERS[i % DIAMETERS.length] * scale;
      const cx = width * ratio + JITTER_X[i % JITTER_X.length] * scale;
      const cy = (TOP_PADDING + row * ROW_PITCH + JITTER_Y[i % JITTER_Y.length]) * scale;
      places.push({ left: cx - size / 2, top: cy - size / 2, size });
    }
    row += 1;
  }
  return { places, height: (TOP_PADDING + (row - 1) * ROW_PITCH + BOTTOM_PADDING) * scale + 40 };
};

/**
 * 관심 주제 버블 밭 — 엇갈린 벌집으로 흩뿌린다(PM 2026-10-09 D안). 위치는 절대 배치라 선택으로 버블이 커져도
 * 이웃이 밀리지 않는다(커지는 것은 transform). 스크롤은 부모가 한다.
 */
export function InterestBubbleField({ topics, isFull, onToggle }: InterestBubbleFieldProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { places, height } = placeAll(topics.length, width);

  return (
    <View style={{ width, height }}>
      {topics.map((topic, index) => {
        const place = places[index];
        return (
          <View
            key={topic.topicId}
            style={[
              styles.slot,
              { left: place.left, top: place.top, zIndex: topic.isSelected ? 2 : 1 },
            ]}
          >
            <InterestBubble
              name={topic.name}
              size={place.size}
              isSelected={topic.isSelected}
              isDimmed={isFull && !topic.isSelected}
              index={index}
              reduceMotion={reduceMotion}
              onPress={() => onToggle(topic.topicId)}
            />
          </View>
        );
      })}
    </View>
  );
}

/** IM9 스켈레톤 — 같은 벌집 자리에 회색 원. 스피너를 가운데 띄우지 않는다(uiux 4.7) */
export function InterestBubbleSkeleton() {
  const { width } = useWindowDimensions();
  const { places, height } = placeAll(SKELETON_COUNT, width);
  return (
    <SkeletonGroup style={{ width, height }}>
      {places.map((place, index) => (
        <SkeletonBlock
          key={index}
          style={[
            styles.slot,
            {
              left: place.left,
              top: place.top,
              width: place.size,
              height: place.size,
              borderRadius: place.size / 2,
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
