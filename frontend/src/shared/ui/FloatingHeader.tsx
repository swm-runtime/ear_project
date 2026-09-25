import { BlurView } from 'expo-blur';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/** 0 = 유리, 1 = 불투명 면. 스크롤 맨 위에서 1, 이만큼 내리면 0 */
type Solidness = Animated.AnimatedInterpolation<number>;
const SOLID_FADE_DISTANCE = 24;
/**
 * 상태 바 밑 **점진 블러 띠**(애플 soft scroll edge effect, 2026-09-25 PM "애플처럼"). 콘텐츠가 상태 바 밑으로
 * 들어올 때만 나타난다(solidness 가 0 으로 갈수록 진해진다). 한 장의 블러는 경계가 칼처럼 끊기므로 세기가 줄어드는
 * 띠 여러 장을 아래로 쌓아 점진 블러를 만들고, 흰 그라데이션(불투명도 계단)을 얹어 상태 바 글자를 지킨다.
 * 안전영역 아래로 이만큼 더 내려가며 사라진다
 */
const SCRIM_EXTEND = 20;
const SCRIM_BANDS = [
  { blur: 40, tint: 0.55 },
  { blur: 28, tint: 0.4 },
  { blur: 18, tint: 0.26 },
  { blur: 10, tint: 0.14 },
  { blur: 4, tint: 0.05 },
] as const;

/**
 * 머리 줄 컨트롤(GlassCapsule)이 읽는 "지금 얼마나 불투명해야 하나". 애플은 유리 컨트롤을 항상 유리로 두고
 * 스크롤 뷰 위 변의 scroll edge effect(콘텐츠가 밑으로 들어올 때만 나타나는 블러 띠)로 가독성을 지킨다 — 맨 위에선
 * 흰 배경 위 유리라 사실상 불투명하게 보인다. 우리는 커스텀 머리 줄이라 그 효과를 못 받아, 결과를 직접 만든다:
 * **맨 위에서는 면(surface), 내리면 유리**(2026-09-25 PM). 없으면(컨텍스트 밖) 항상 유리
 */
const HeaderSolidnessContext = createContext<Solidness | null>(null);
export const useHeaderSolidness = (): Solidness | null => useContext(HeaderSolidnessContext);

interface FloatingHeaderProps {
  children: ReactNode;
  /** 자식이 차지한 높이(안전영역 제외) — 목록이 이만큼 위를 비운다(useFloatingHeaderInset) */
  onHeightChange: (height: number) => void;
  /** useFloatingHeaderScroll 의 solidness — 주면 안의 GlassCapsule 이 맨 위에서 불투명해진다 */
  solidness?: Solidness;
}

/**
 * 화면 위에 **떠 있는 머리 줄**(검색창·세그먼트·칩) — 배경 없이 목록 위에 절대 배치돼 콘텐츠가 그 밑으로 흐른다
 * (2026-09-24 PM "배경을 없애버리자" — iOS 26 처럼 유리 컨트롤이 콘텐츠 위에 뜬다. 탭 바와 같은 문법).
 * 안전영역(상태 바)은 여기서 채우고, 자식의 높이만 올려 목록이 `paddingTop` 으로 비운다.
 */
export default function FloatingHeader({ children, onHeightChange, solidness }: FloatingHeaderProps) {
  const insets = useSafeAreaInsets();
  // 띠의 불투명도 = 1 − solidness — 맨 위(콘텐츠가 밑에 없음)에서 0, 내리면 1
  const scrimOpacity = useMemo(
    () => (solidness ? Animated.subtract(1, solidness) : null),
    [solidness],
  );
  return (
    <HeaderSolidnessContext.Provider value={solidness ?? null}>
      <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
        {scrimOpacity ? (
          <Animated.View
            style={[styles.scrim, { height: insets.top + SCRIM_EXTEND, opacity: scrimOpacity }]}
            pointerEvents="none"
          >
            {SCRIM_BANDS.map((band, index) => (
              <View key={index} style={styles.scrimBand}>
                {/* Android 의 실험 블러는 띠 5장이 무겁다 — 흰 그라데이션만 */}
                {Platform.OS === 'ios' ? (
                  <BlurView style={StyleSheet.absoluteFill} tint="light" intensity={band.blur} />
                ) : null}
                <View
                  style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${band.tint})` }]}
                />
              </View>
            ))}
          </Animated.View>
        ) : null}
        <View onLayout={(e) => onHeightChange(e.nativeEvent.layout.height)} pointerEvents="box-none">
          {children}
        </View>
      </View>
    </HeaderSolidnessContext.Provider>
  );
}

/**
 * 목록 `contentContainerStyle.paddingTop` — 머리 줄 높이 + 상태 바. 시스템 탭 바(iOS 26)에서는 스크롤 뷰가
 * `contentInsetAdjustmentBehavior="automatic"` 으로 상태 바를 이미 비우므로 머리 줄 높이만 더한다
 */
export const useFloatingHeaderInset = (headerHeight: number): number => {
  const insets = useSafeAreaInsets();
  return headerHeight + (HAS_NATIVE_TAB_BAR ? 0 : insets.top);
};

/**
 * 목록 스크롤을 머리 줄에 잇는다 — `scrollProps` 를 Animated.FlatList/ScrollView 에 펼치고 `solidness` 를
 * FloatingHeader 에 준다. 맨 위(정지 오프셋: 시스템 탭 바면 −상태 바, 아니면 0)에서 1, 24pt 내리면 0.
 * 당겨서 새로고침(음수 쪽)은 그대로 1
 */
export const useFloatingHeaderScroll = () => {
  const insets = useSafeAreaInsets();
  const restOffset = HAS_NATIVE_TAB_BAR ? -insets.top : 0;
  const scrollY = useAnimatedValue(restOffset);
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );
  const solidness = useMemo(
    () =>
      scrollY.interpolate({
        // 정지 오프셋이 1pt 남짓 어긋나도 맨 위에서 1 이 되게 여유를 둔다
        inputRange: [restOffset - 1, restOffset + SOLID_FADE_DISTANCE],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [scrollY, restOffset],
  );
  return {
    solidness,
    scrollProps: { onScroll, scrollEventThrottle: 16 } as const,
  };
};

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  // 머리 줄 컨트롤 뒤, 화면 맨 위에 붙는다 — 상태 바 + 조금 아래
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scrimBand: {
    flex: 1,
  },
});
