import { useEffect } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/shared/hooks/useReduceMotion';

/** 막대 셋의 멈춘 높이(비율) — 일시정지·동작 줄이기에서는 이 모양으로 선다 */
const RESTING = [0.55, 1, 0.75] as const;
/** 막대마다 다른 주기·시작 지연 — 셋이 같이 움직이면 이퀄라이저가 아니라 한 덩어리로 보인다 */
const PERIOD_MS = [420, 520, 460] as const;
const DELAY_MS = [0, 140, 260] as const;
const MIN_SCALE = 0.3;

interface NowPlayingBarsProps {
  color: ColorValue;
  /** 재생 중이면 움직이고, 일시정지면 멈춘 모양 */
  isPlaying: boolean;
  /** 상자 높이 — 막대는 이 높이 안에서 아래를 기준으로 자란다 */
  size?: number;
}

/**
 * 재생 중 표식 — 시리즈 목록에서 화수 번호 자리를 대신하는 막대 셋(애플 뮤직 트랙 목록 문법, PM 2026-10-22).
 * UI 스레드(reanimated)에서 돈다 — JS Animated 반복은 Android 복귀 때 큐가 밀려 OOM 이 난 적이 있다
 */
export default function NowPlayingBars({ color, isPlaying, size = 14 }: NowPlayingBarsProps) {
  const reduceMotion = useReduceMotion();
  const isMoving = isPlaying && reduceMotion === false;
  const barWidth = Math.max(2, Math.round(size / 5));

  return (
    <View
      style={[styles.box, { height: size, gap: Math.max(1, Math.round(barWidth * 0.75)) }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {RESTING.map((resting, index) => (
        <Bar
          key={index}
          color={color}
          width={barWidth}
          height={size}
          resting={resting}
          periodMs={PERIOD_MS[index]}
          delayMs={DELAY_MS[index]}
          isMoving={isMoving}
        />
      ))}
    </View>
  );
}

interface BarProps {
  color: ColorValue;
  width: number;
  height: number;
  resting: number;
  periodMs: number;
  delayMs: number;
  isMoving: boolean;
}

function Bar({ color, width, height, resting, periodMs, delayMs, isMoving }: BarProps) {
  const scale = useSharedValue(resting);

  useEffect(() => {
    if (!isMoving) {
      cancelAnimation(scale);
      scale.value = withTiming(resting, { duration: 160 });
      return;
    }
    scale.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(MIN_SCALE, { duration: periodMs, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(scale);
  }, [isMoving, resting, periodMs, delayMs, scale]);

  // 아래 끝을 고정하고 위로만 자라게 — 가운데 기준 scaleY 를 높이 절반만큼 내려 보정한다
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (height * (1 - scale.value)) / 2 }, { scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: width / 2, backgroundColor: color }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
