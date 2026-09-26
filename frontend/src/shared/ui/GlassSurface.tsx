import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
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
 * 탭 바를 **시스템(UITabBarController)** 으로 그린다 — iOS 26 에서만(2026-09-24 PM "애플이 제공하는 애니메이션 없나").
 * 선택 알약의 부풀기·끌기·굴절·고무줄이 애플 코드 그대로 나오고, 미니플레이어는 `bottomAccessory`(Music 앱 자리)가 된다.
 * 그 밑 iOS·Android 는 JS 캡슐(CapsuleTabBar)이 그대로다. 목록의 바닥 여백 규칙도 갈린다(useBottomDockInset)
 */
export const HAS_NATIVE_TAB_BAR = HAS_LIQUID_GLASS;

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

interface GlassGroupProps {
  /** 이 거리 안으로 가까워진 유리끼리 물방울처럼 합쳐진다 */
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'box-none' | 'auto';
  children?: ReactNode;
}

/**
 * 유리 묶음 — 같은 묶음 안의 GlassSurface·GlassPill 은 서로 가까워지면 **모핑 병합**된다(iOS 26 UIGlassContainerEffect,
 * PM 2026-09-23 "물방울이 합쳐지는 애니메이션"). 미니플레이어 카드가 캡슐 탭 바로 내려갈 때 둘이 한 덩어리로
 * 붙는다. 그 밑 OS 는 그냥 View
 */
export function GlassGroup({ spacing = 24, style, pointerEvents, children }: GlassGroupProps) {
  if (HAS_LIQUID_GLASS) {
    return (
      <GlassContainer spacing={spacing} style={style} pointerEvents={pointerEvents}>
        {children}
      </GlassContainer>
    );
  }
  return (
    <View style={style} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
}

interface GlassPillProps {
  /** 위치·크기·transform — 호출부의 Animated 스타일 그대로 */
  style: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  /**
   * 알약이 담긴 **용기(캡슐)의 자리** — 알약 로컬 좌표로, 알약이 커지고 움직여도 화면에서는 용기와 정확히 겹치게
   * 호출부가 역변환(translate·1/scale)을 넣어 준다. 주면 유리는 이 자리 안에서만 그려지고 용기의 테두리가 알약을
   * 통해 보인다 — 알약이 용기 밖으로 넘친 부분은 **완전히 투명**하다(PM 2026-09-24 "안쪽에 캡슐 경계가 보여야 하고
   * 그 밖은 완전 투명"). 렌즈는 밑에 있는 것을 보이는 것이지 새 면을 만드는 게 아니다. 없으면 알약 전체가 유리다
   */
  lens?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
}

/**
 * 선택 알약(탭 바·세그먼트) — iOS 26 에서는 **유리 렌즈**(선택된 칸이 유리로 살짝 떠 보인다, iOS 26 탭 바처럼),
 * 그 밑에서는 투명 면 + 윤곽선·그림자. 항상 pointerEvents none — 눌리는 건 그 위의 칸이다(2026-09-23 PM).
 *
 * 움직이는 건 **일반 Animated.View** 이고 유리는 그 안에 고정 자식으로 둔다 — GlassView 자체를 Animated 로
 * 만들면 스프링은 돌지만 끌기의 setValue 가 실기기에서 반영되지 않았다(2026-09-23, 세 번 확인)
 */
export function GlassPill({ style, lens }: GlassPillProps) {
  /*
   * **유리 위에 유리를 올리지 않는다**(WWDC25 Meet Liquid Glass: "Always avoid glass on glass … use fills,
   * transparency, and vibrancy for the top elements"). 유리는 유리를 샘플링하지 않아, 알약을 두 번째 유리로 만들면
   * 알약이 캡슐을 건너뛰고 밑의 콘텐츠만 비춘다 — clear 면 어두운 썸네일 위에서 검은 구멍, regular 면 회색 판이
   * 됐다(2026-09-23·24 실기기). 그래서
   * - lens 있음(탭 바): 알약은 유리가 아니라 **용기 유리 위의 반투명 채움**이다. 용기 자리에 잘라 그리므로
   *   채움 아래로 캡슐의 유리·경계가 그대로 비치고, 알약이 넘친 부분(용기 밖)은 투명하다.
   * - lens 없이(세그먼트): 종전대로 clear 유리 알약(세그먼트 바탕은 유리가 아니라 겹침이 없다)
   */
  return (
    <Animated.View style={[style, HAS_LIQUID_GLASS ? styles.pillClear : styles.pillTint]} pointerEvents="none">
      {lens ? (
        // 알약(clip) ∩ 용기 = 채움, 알약 − 용기 = 투명. 용기 테두리는 채움 위에 한 번 더 그려 경계가 읽히게
        <Animated.View style={[lens, styles.lensFrame]} pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, styles.pillFill]} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFill, styles.lensEdge]} pointerEvents="none" />
        </Animated.View>
      ) : HAS_LIQUID_GLASS ? (
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
  // 용기 자리 — 유리를 이 모양으로 자른다. 위치·크기·역변환은 호출부 lens 스타일이 준다
  lensFrame: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 999,
  },
  // 선택 채움 — 애플 탭 바의 선택 캡슐처럼 유리 위의 얇은 검정 틴트(systemFill 급). 유리가 아니다
  pillFill: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  // 용기의 테두리(CapsuleTabBar.capsuleBorder 와 같은 값) — 알약이 용기 밖으로 넘칠 때 렌즈 안에 보이는 경계
  lensEdge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.10)',
  },
  pillRim: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderBottomColor: 'rgba(0, 0, 0, 0.10)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 1px 3px rgba(0, 0, 0, 0.12)',
  },
});
