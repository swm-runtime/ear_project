import { createContext, useContext, useEffect, type ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type ColorValue,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { motion, theme } from '@/shared/theme';

/**
 * 공용 스켈레톤 — 내용을 불러오는 동안 곧 나타날 레이아웃 모양의 자리를 그린다(design.md §5 스켈레톤).
 *
 * - `SkeletonGroup` 이 **로딩 영역 하나**다. 낭독기에는 이 영역만 "불러오는 중" 하나로 읽히고, 안의 블록은 숨는다.
 *   반짝임(불투명도 왕복)도 영역 단위로 하나만 돈다 — 블록마다 루프를 돌리면 목록 스켈레톤에서 수십 개가 된다.
 * - `SkeletonBlock`·`SkeletonLine`·`SkeletonCircle` 은 색·모서리만 정해진 빈 면이다. 치수는 실제 레이아웃과 같게
 *   호출부가 준다 — 모양이 다르면 로딩이 끝나는 순간 화면이 튄다.
 * - 0.3초 미만 미표시는 호출부가 `useDelayedVisible` 로 감싼다(common-error-handling.md 5).
 */

/** 로딩 영역의 낭독 라벨 — 영역마다 하나(design.md §5 스켈레톤 · §6) */
export const SKELETON_A11Y_LABEL = '불러오는 중';
/** 반짝임 — 영역 불투명도가 1 ↔ 이 값을 오간다. 블록이 사라져 보이지 않을 만큼만 옅어진다 */
export const SKELETON_PULSE_MIN_OPACITY = 0.5;
/** 반짝임 한 방향 길이(ms) — 왕복 1.6초. 애플 placeholder 의 느린 숨쉬기 박자 */
export const SKELETON_PULSE_DURATION_MS = 800;

type SkeletonRadius = keyof typeof theme.radius | number;

const SkeletonColorContext = createContext<ColorValue>(theme.color.surface);

const toRadius = (radius: SkeletonRadius): number =>
  typeof radius === 'number' ? radius : theme.radius[radius];

interface SkeletonGroupProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 블록 면의 색 — 기본 `theme.color.surface`. 어두운 바탕(플레이어)은 그쪽 토큰을 넘긴다 */
  color?: ColorValue;
  /** 영역의 낭독 라벨. 무엇을 불러오는지 밝힐 카피가 있으면 넘긴다 */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * 로딩 영역 — 낭독 라벨 하나 + 반짝임 하나. OS "동작 줄이기"가 켜져 있으면(또는 아직 모르면) 반짝이지 않는다.
 * 반짝임은 `opacity` 만 네이티브 드라이버로 돌린다 — 상시 도는 애니메이션이 JS 스레드를 잡지 않게(design.md §4).
 */
export function SkeletonGroup({
  children,
  style,
  color = theme.color.surface,
  accessibilityLabel = SKELETON_A11Y_LABEL,
  testID,
}: SkeletonGroupProps) {
  const pulse = useAnimatedValue(1);
  const isReduceMotion = useReduceMotion();
  const shouldPulse = isReduceMotion === false;

  // 반짝임 루프와 동기화한다 — 동작 줄이기면 루프를 세우고 불투명도를 1 로 돌린다
  useEffect(() => {
    if (!shouldPulse) {
      pulse.setValue(1);
      return;
    }
    const half = (toValue: number) =>
      Animated.timing(pulse, {
        toValue,
        duration: SKELETON_PULSE_DURATION_MS,
        easing: motion.easing.easeInOut,
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([half(SKELETON_PULSE_MIN_OPACITY), half(1)]));
    loop.start();
    return () => loop.stop();
  }, [pulse, shouldPulse]);

  // 영역 하나가 낭독 대상 하나다 — 레이아웃(방향·간격·패딩)도 이 View 가 갖는다. 블록은 각자 읽기에서 빠진다
  return (
    <Animated.View
      style={[style, { opacity: pulse }]}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
    >
      <SkeletonColorContext.Provider value={color}>{children}</SkeletonColorContext.Provider>
    </Animated.View>
  );
}

interface SkeletonBlockProps {
  width?: DimensionValue;
  height?: DimensionValue;
  /** 반지름 토큰 이름 또는 값 — 기본 `sm`. 실제 요소와 같은 모서리를 준다(design.md §2) */
  radius?: SkeletonRadius;
  style?: StyleProp<ViewStyle>;
}

/** 사각 면 — 썸네일·카드·칩. 치수는 `width`·`height` 또는 `style` 로 준다 */
export function SkeletonBlock({ width, height, radius = 'sm', style }: SkeletonBlockProps) {
  const color = useContext(SkeletonColorContext);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { borderRadius: toRadius(radius), backgroundColor: color },
        width !== undefined && { width },
        height !== undefined && { height },
        style,
      ]}
    />
  );
}

interface SkeletonLineProps {
  /** 기본 전체 폭. 마지막 줄은 짧게 줘서 문단처럼 보이게 한다 */
  width?: DimensionValue;
  /** 기본 본문 글자 크기(`font.size.md`) — 대신할 글자의 크기를 넘긴다 */
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** 글자 한 줄 자리 — 높이는 글자 크기, 모서리 `sm` */
export function SkeletonLine({
  width = '100%',
  height = theme.font.size.md,
  style,
}: SkeletonLineProps) {
  return <SkeletonBlock width={width} height={height} radius="sm" style={style} />;
}

interface SkeletonCircleProps {
  size: number;
  style?: StyleProp<ViewStyle>;
}

/** 원 — 아바타·원형 아이콘 자리 */
export function SkeletonCircle({ size, style }: SkeletonCircleProps) {
  return <SkeletonBlock width={size} height={size} radius={size / 2} style={style} />;
}

const styles = StyleSheet.create({
  block: {
    borderCurve: 'continuous',
  },
});
