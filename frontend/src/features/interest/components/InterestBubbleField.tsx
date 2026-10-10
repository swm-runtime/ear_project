import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';

import InterestBubble, { SCALE_DIMMED, SCALE_SELECTED } from './InterestBubble';
import {
  bubbleBaseSize,
  bubbleSizeAt,
  createBubbleSim,
  settleBubbleSim,
  stepBubbleSim,
  type BubbleSim,
} from '../services/bubble-physics';

interface BubbleTopic {
  topicId: string;
  name: string;
  isSelected: boolean;
}

interface InterestBubbleFieldProps {
  topics: BubbleTopic[];
  /** 상한까지 다 골랐는가 — 남은 주제를 흐리고 작게 한다(눌러도 고르지 않고 토스트 — 훅이 막는다) */
  isFull: boolean;
  onToggle: (topicId: string) => void;
}

const SKELETON_COUNT = 9;

/**
 * 관심 주제 버블 밭 — **UI 스레드 물리**(PM 2026-10-10 "버블 최대한 좋게", runtime 33 Reanimated).
 * 모델은 services/bubble-physics: 버블마다 주제 순서대로 정한 자기 자리로 끌리는 용수철 + 충돌 + 감속.
 *
 * - 처음엔 밭 바깥에서 각자 자리로 **날아들어 와** 모인다
 * - 고르면 커지면서 이웃을 밀고, 밀린 이웃은 자기 자리로 돌아간다 — **순서는 바뀌지 않는다**
 * - 끌기는 없다(PM 2026-10-10 17:27 "끌려가거나 하는 건 좀 그렇다") — 탭만 받는다
 * - 고요해지면 계산을 쉰다(배터리). 선택·끌기가 오면 다시 깬다
 * - 동작 줄이기면 끝 상태를 바로 그린다(날아들기·출렁임 없음)
 *
 * 물리 상태는 UI 런타임의 공유 값 하나(배열 묶음)이고, 버블마다 그 i 번째 값을 transform 으로 읽는다.
 * JS 스레드는 선택·크기 변화만 알린다 — JS 가 바빠도 움직임이 끊기지 않는다.
 */
export function InterestBubbleField({ topics, isFull, onToggle }: InterestBubbleFieldProps) {
  const reduceMotion = useReduceMotion();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const sim = useSharedValue<BubbleSim | null>(null);
  const awake = useSharedValue(false);

  const count = topics.length;
  const base = bubbleBaseSize(count, box.width, box.height);
  const sizes = useMemo(
    () => Array.from({ length: count }, (_, index) => bubbleSizeAt(index, base)),
    [count, base],
  );
  const targets = topics.map((topic) =>
    topic.isSelected ? SCALE_SELECTED : isFull ? SCALE_DIMMED : 1,
  );
  const targetsKey = targets.join(',');

  // 밭 크기·주제 수가 정해지면 새로 띄운다 — 바깥에서 날아들어 온다(동작 줄이기면 끝 상태로)
  useEffect(() => {
    if (box.width === 0 || box.height === 0 || sizes.length === 0 || reduceMotion === null) return;
    const next = createBubbleSim(sizes, box.width, box.height);
    targetsKey.split(',').forEach((target, index) => {
      next.target[index] = Number(target);
    });
    if (reduceMotion) settleBubbleSim(next);
    sim.set(next);
    awake.set(!reduceMotion);
    // 선택 변화는 아래 effect 가 따라간다 — 여기서는 처음 띄울 때의 목표만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.width, box.height, sizes, reduceMotion]);

  // 선택·상한이 바뀌면 목표 배율만 바꾸고 물리를 깨운다 — 커지는 동안 이웃이 연쇄로 밀린다
  useEffect(() => {
    const nextTargets = targetsKey.split(',').map(Number);
    const settle = reduceMotion === true;
    scheduleOnUI(() => {
      'worklet';
      sim.modify((current) => {
        'worklet';
        if (current === null) return current;
        for (let i = 0; i < current.target.length && i < nextTargets.length; i += 1) {
          current.target[i] = nextTargets[i];
        }
        current.calmFor = 0;
        if (settle) settleBubbleSim(current);
        return current;
      });
      awake.set(!settle);
    });
  }, [targetsKey, reduceMotion, sim, awake]);

  useFrameCallback((frame) => {
    'worklet';
    if (!awake.get() || sim.get() === null) return;
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    let calm = false;
    sim.modify((current) => {
      'worklet';
      if (current === null) return current;
      calm = stepBubbleSim(current, dt);
      return current;
    });
    if (calm) awake.set(false);
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (Math.abs(width - box.width) > 0.5 || Math.abs(height - box.height) > 0.5) {
      setBox({ width, height });
    }
  };

  return (
    <View style={styles.field} onLayout={onLayout}>
      {box.width > 0
        ? topics.map((topic, index) => (
            <PhysicsSlot
              key={topic.topicId}
              sim={sim}
              index={index}
              size={sizes[index] ?? base}
              isSelected={topic.isSelected}
            >
              <InterestBubble
                name={topic.name}
                size={sizes[index] ?? base}
                isSelected={topic.isSelected}
                isDimmed={isFull && !topic.isSelected}
                onPress={() => onToggle(topic.topicId)}
              />
            </PhysicsSlot>
          ))
        : null}
    </View>
  );
}

interface PhysicsSlotProps {
  sim: SharedValue<BubbleSim | null>;
  index: number;
  size: number;
  isSelected: boolean;
  children: ReactNode;
}

/** 물리의 i 번째 원을 따라가는 틀 — 자리·배율 모두 transform(UI 스레드) */
function PhysicsSlot({ sim, index, size, isSelected, children }: PhysicsSlotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const current = sim.get();
    if (current === null || index >= current.x.length) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [
        { translateX: current.x[index] - size / 2 },
        { translateY: current.y[index] - size / 2 },
        { scale: current.scale[index] },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.slot,
        { width: size, height: size, zIndex: isSelected ? 2 : 1 },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** IM9 스켈레톤 — 가운데에 모인 회색 원(물리를 미리 끝까지 돌린 자리). 스피너를 가운데 띄우지 않는다(uiux 4.7) */
export function InterestBubbleSkeleton() {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const base = bubbleBaseSize(16, box.width, box.height);
  const settled = useMemo(() => {
    if (box.width === 0 || box.height === 0) return null;
    const sizes = Array.from({ length: SKELETON_COUNT }, (_, index) => bubbleSizeAt(index, base));
    const next = createBubbleSim(sizes, box.width, box.height);
    settleBubbleSim(next);
    return next;
  }, [box.width, box.height, base]);
  return (
    <View
      style={styles.field}
      onLayout={(event) =>
        setBox({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
      }
    >
      {settled ? (
        <SkeletonGroup style={StyleSheet.absoluteFill}>
          {settled.x.map((x, index) => (
            <SkeletonBlock
              key={index}
              style={[
                styles.slot,
                {
                  left: x - settled.size[index] / 2,
                  top: settled.y[index] - settled.size[index] / 2,
                  width: settled.size[index],
                  height: settled.size[index],
                  borderRadius: settled.size[index] / 2,
                },
              ]}
            />
          ))}
        </SkeletonGroup>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    overflow: 'hidden',
  },
  slot: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
