import { createContext, useContext, useMemo, type ReactNode, type RefObject } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/** 0 = 유리, 1 = 불투명 면. 스크롤 맨 위에서 1, 이만큼 내리면 0 */
type Solidness = Animated.AnimatedInterpolation<number>;
const SOLID_FADE_DISTANCE = 24;

/**
 * 머리 줄 컨트롤(GlassCapsule)이 읽는 "지금 얼마나 불투명해야 하나" — **맨 위에서는 일반 컴포넌트(면), 내리면
 * 리퀴드 글라스**(PM 2026-09-25 결정. 16:30 에 "그냥 상단 blur" 를 잘못 읽고 걷어냈다가 17:25 "왜 뺐어" 로 복구).
 * 애플은 유리를 항상 유리로 두지만 흰 배경 위에선 면처럼 보이고, 콘텐츠가 밑으로 들어오면 유리가 드러난다 —
 * 우리는 그 결과를 스크롤 값으로 명시한다. 없으면(컨텍스트 밖·튜토리얼) 항상 유리
 */
const HeaderSolidnessContext = createContext<Solidness | null>(null);
export const useHeaderSolidness = (): Solidness | null => useContext(HeaderSolidnessContext);

interface FloatingHeaderProps {
  children: ReactNode;
  /** 자식이 차지한 높이(안전영역 제외) — 목록이 이만큼 위를 비운다(useFloatingHeaderInset) */
  onHeightChange: (height: number) => void;
  /** useFloatingHeaderScroll 의 solidness — 주면 안의 GlassCapsule 이 맨 위에서 면이 된다 */
  solidness?: Solidness;
  /**
   * 머리 줄 루트 뷰 ref — useSystemScrollEdgeEffect 가 이 뷰에 `UIScrollEdgeElementContainerInteraction` 을 붙여
   * iOS 26 이 "바" 로 인식하고 그 밑(상태 바 + 머리 줄)에 점진 블러를 그리게 한다
   */
  containerRef?: RefObject<View | null>;
}

/**
 * 화면 위에 **떠 있는 머리 줄**(검색창·세그먼트·칩) — 배경 없이 목록 위에 절대 배치돼 콘텐츠가 그 밑으로 흐른다
 * (2026-09-24 PM "배경을 없애버리자" — iOS 26 처럼 유리 컨트롤이 콘텐츠 위에 뜬다. 탭 바와 같은 문법).
 * 안전영역(상태 바)은 여기서 채우고, 자식의 높이만 올려 목록이 `paddingTop` 으로 비운다.
 * 상태 바 밑 블러는 여기서 그리지 않는다 — iOS 26 시스템 scroll edge effect 가 목록에 직접 건다
 * (`useSystemScrollEdgeEffect`). JS 로 만든 띠·마스크 블러는 계단·얼룩으로 폐기했다(2026-09-25).
 */
export default function FloatingHeader({
  children,
  onHeightChange,
  solidness,
  containerRef,
}: FloatingHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <HeaderSolidnessContext.Provider value={solidness ?? null}>
      <View
        ref={containerRef}
        style={[styles.header, { paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        <View
          onLayout={(e) => onHeightChange(e.nativeEvent.layout.height)}
          pointerEvents="box-none"
        >
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
 * 당겨서 새로고침(음수 쪽)은 그대로 1. 네이티브 드라이버라 JS 스레드를 타지 않는다
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
});
