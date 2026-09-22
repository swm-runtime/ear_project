import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface GlassSurfaceProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** 블러 위에 얹는 밝은 틴트 — 애플 머티리얼처럼 블러만으론 글자가 안 읽혀 반투명 흰 면을 한 겹 더 둔다 */
const TINT_COLOR = 'rgba(245, 245, 247, 0.72)';
/** 블러 세기 — 100 이면 뒤가 완전히 뭉개져 유리가 아니라 젖빛 판이 된다 */
const BLUR_INTENSITY = 60;

/** iOS 26 리퀴드 글라스는 앱 시작 시 한 번만 판정하면 된다(OS 가 바뀌지 않는다) */
const HAS_LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

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

const styles = StyleSheet.create({
  tint: {
    backgroundColor: TINT_COLOR,
  },
});
