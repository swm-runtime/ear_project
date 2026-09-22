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

/**
 * 떠 있는 면(미니플레이어·탭 바)의 바탕 — 뒤의 목록이 흐리게 비친다(2026-09-22 PM — "애플처럼").
 *
 * - iOS 26+: 애플의 리퀴드 글라스(`expo-glass-effect` GlassView, regular). 시스템이 재질·굴절·하이라이트를 그린다.
 * - 그 밑 iOS · Android: `expo-blur` 블러 + 밝은 틴트. Android 는 실험 블러(dimezisBlurView)를 켠다 — 안 켜면
 *   블러 없이 반투명 면만 남는다.
 *
 * 자식은 그 위에 그려진다. 크기·위치는 호출부의 style 이 정한다(보통 absoluteFill)
 */
export default function GlassSurface({ style, children }: GlassSurfaceProps) {
  if (HAS_LIQUID_GLASS) {
    return (
      <GlassView style={style} glassEffectStyle="regular" colorScheme="light">
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView
      style={style}
      tint="light"
      intensity={BLUR_INTENSITY}
      experimentalBlurMethod="dimezisBlurView"
    >
      <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
      {children}
    </BlurView>
  );
}

interface GlassPillProps {
  /** 위치·크기·transform — 호출부의 Animated 스타일 그대로 */
  style: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
}

/**
 * 선택 알약(탭 바·세그먼트) — iOS 26 에서는 **유리 렌즈**(선택된 칸이 유리로 살짝 떠 보인다, iOS 26 탭 바처럼),
 * 그 밑에서는 투명 면 + 윤곽선·그림자. 항상 pointerEvents none — 눌리는 건 그 위의 칸이다(2026-09-23 PM).
 *
 * 움직이는 건 **일반 Animated.View** 이고 유리는 그 안에 고정 자식으로 둔다 — GlassView 자체를 Animated 로
 * 만들면 스프링은 돌지만 끌기의 setValue 가 실기기에서 반영되지 않았다(2026-09-23, 세 번 확인)
 */
export function GlassPill({ style }: GlassPillProps) {
  return (
    <Animated.View style={[style, HAS_LIQUID_GLASS ? styles.pillClear : styles.pillTint]} pointerEvents="none">
      {/* 캡슐과 같은 재질(regular, 틴트 없음) — 유리는 유리를 샘플링하지 않아 clear 알약은 캡슐을 건너뛰고 뒤의
          목록만 굴절시켰다(알약 자리에서 캡슐이 사라져 보임, PM 2026-09-23). 같은 재질이면 커져서 넘친 부분이
          캡슐이 불룩 튀어나온 것으로 읽힌다 */}
      {/* 알약만 clear(맑은 렌즈, PM 2026-09-23) — 캡슐은 regular 그대로. 경계는 아래 림이 그린다 */}
      {HAS_LIQUID_GLASS ? (
        <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="clear" colorScheme="light" />
      ) : null}
      {/* 림 — 같은 재질의 유리가 겹치면 iOS 가 경계를 그리지 않아 알약 윤곽이 사라진다. 위쪽 흰 하이라이트 +
          바깥 얇은 그림자로 렌즈의 가장자리를 직접 준다(PM 2026-09-23 "겹치면 안쪽에 보여야") */}
      <View style={[StyleSheet.absoluteFill, styles.pillRim]} pointerEvents="none" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tint: {
    backgroundColor: TINT_COLOR,
  },
  // iOS 26 미만·Android 의 알약 — 면을 채우지 않는다(PM "완전 투명"). 윤곽선과 그림자만으로 자리를 보인다
  pillTint: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.14)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.10)',
  },
  // 유리 자식이 알약 모양으로 잘리게 — 반지름은 호출부 style 이 준다. 그림자는 clip 밖으로 나가야 해서 림에 둔다
  pillClear: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  pillRim: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderBottomColor: 'rgba(0, 0, 0, 0.10)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 1px 3px rgba(0, 0, 0, 0.12)',
  },
});
