import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface GlassSurfaceProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** 블러 위에 얹는 밝은 틴트 — 애플 머티리얼처럼 블러만으론 글자가 안 읽혀 반투명 흰 면을 한 겹 더 둔다 */
const TINT_COLOR = 'rgba(245, 245, 247, 0.72)';
/** 블러 세기 — 100 이면 뒤가 완전히 뭉개져 유리가 아니라 젖빛 판이 된다 */
const BLUR_INTENSITY = 60;

/** iOS 26 리퀴드 글라스는 앱 시작 시 한 번만 판정하면 된다(OS 가 바뀌지 않는다) */
export const HAS_LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

interface GlassPillProps {
  /** 위치·크기·transform — 호출부의 Animated 스타일 그대로 */
  style: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
}

/**
 * 선택 알약(탭 바·세그먼트) — iOS 26 에서는 **유리 렌즈**(선택된 칸이 유리로 살짝 떠 보인다, iOS 26 탭 바처럼),
 * 그 밑에서는 검정 6% 틴트 면. 항상 pointerEvents none — 눌리는 건 그 위의 칸이다(2026-09-23 PM).
 *
 * 움직이는 건 **일반 Animated.View** 이고 유리는 그 안에 고정 자식으로 둔다 — GlassView 자체를 Animated 로
 * 만들면 스프링은 돌지만 끌기의 setValue 가 실기기에서 반영되지 않았다(2026-09-23, 세 번 확인)
 */
export function GlassPill({ style }: GlassPillProps) {
  return (
    <Animated.View style={[style, HAS_LIQUID_GLASS ? styles.pillClear : styles.pillTint]} pointerEvents="none">
      {HAS_LIQUID_GLASS ? (
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          colorScheme="light"
          tintColor="rgba(255, 255, 255, 0.35)"
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tint: {
    backgroundColor: TINT_COLOR,
  },
  pillTint: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  // 유리 자식이 알약 모양으로 잘리게 — 반지름은 호출부 style 이 준다
  pillClear: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
