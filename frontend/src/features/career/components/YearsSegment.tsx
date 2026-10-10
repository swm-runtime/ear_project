import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import type { YearsOfExperienceRange } from '../career.types';

interface YearsSegmentProps {
  options: YearsOfExperienceRange[];
  labels: Record<YearsOfExperienceRange, string>;
  /** 비어 있을 수 있다 — 선택한 칸을 다시 누르면 해제(빈 값 저장 경로, career-uiux 4.4) */
  value: YearsOfExperienceRange | null;
  onToggle: (value: YearsOfExperienceRange) => void;
  disabled: boolean;
}

/** 트랙 안쪽 여백 = 칸 사이 간격 */
const INSET = 3;

/**
 * 연차 구간 선택 — 연회색 캡슐 트랙 위에 **떠 있는 흰 캡슐**이 고른 칸으로 미끄러진다(PM 2026-10-10 "토글 흰색으로 ·
 * 토글 애니메이션 넣고"). iOS 26 UISegmentedControl 모양(공용 SegmentedControl `ios26` 과 같은 그림자)이지만, 공용 부품은
 * 값이 늘 하나 있어야 해서 **빈 값(해제)** 을 못 그린다 — 해제면 흰 캡슐이 제자리에서 사라지고, 빈 상태에서 고르면 그 칸에서
 * 나타난다. 칸끼리 옮길 때만 미끄러진다(snappy, 네이티브 드라이버)
 */
export default function YearsSegment({
  options,
  labels,
  value,
  onToggle,
  disabled,
}: YearsSegmentProps) {
  /** 칸 폭 — 트랙 폭을 재서 나눈다. 측정 전 0 */
  const [itemWidth, setItemWidth] = useState(0);
  const handleLayout = (event: LayoutChangeEvent) => {
    const inner = event.nativeEvent.layout.width - INSET * 2;
    const next = (inner - INSET * (options.length - 1)) / options.length;
    setItemWidth((prev) => (Math.abs(prev - next) < 0.5 ? prev : Math.max(0, next)));
  };

  const selectedIndex = value === null ? -1 : options.indexOf(value);
  const thumbX = useAnimatedValue(0);
  const thumbShown = useAnimatedValue(0);
  /** 직전에 흰 캡슐이 보였는가 — 빈 상태에서 고를 때는 미끄러지지 않고 그 칸에서 나타난다 */
  const wasShown = useRef(false);

  useEffect(() => {
    if (itemWidth <= 0) return;
    if (selectedIndex < 0) {
      wasShown.current = false;
      Animated.spring(thumbShown, { toValue: 0, useNativeDriver: true, ...motion.spring.snappy }).start();
      return;
    }
    const toX = selectedIndex * (itemWidth + INSET);
    if (wasShown.current) {
      Animated.spring(thumbX, { toValue: toX, useNativeDriver: true, ...motion.spring.snappy }).start();
    } else {
      thumbX.setValue(toX);
    }
    wasShown.current = true;
    Animated.spring(thumbShown, { toValue: 1, useNativeDriver: true, ...motion.spring.snappy }).start();
  }, [itemWidth, selectedIndex, thumbShown, thumbX]);

  return (
    <View style={styles.track} onLayout={handleLayout} accessibilityRole="radiogroup">
      {itemWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: itemWidth,
              opacity: thumbShown,
              transform: [
                { translateX: thumbX },
                // 나타날 때 살짝 커지며 — 0.9 → 1
                { scale: thumbShown.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
              ],
            },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const isSelected = value === option;
        return (
          <Pressable
            key={option}
            style={styles.item}
            disabled={disabled}
            onPress={() => onToggle(option)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled }}
            accessibilityLabel={labels[option]}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
              {labels[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: INSET,
    gap: INSET,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  // 떠 있는 흰 캡슐 — 공용 SegmentedControl ios26 과 같은 이중 그림자
  thumb: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.12), 0 3px 1px rgba(0, 0, 0, 0.04)',
  },
  item: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight - INSET * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 굵기는 선택과 무관하게 같다(폭이 변하면 흔들린다) — 비선택은 회색, 선택은 검정
  label: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  labelSelected: {
    color: theme.color.textPrimary,
  },
});
