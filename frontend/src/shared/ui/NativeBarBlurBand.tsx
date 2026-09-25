import { BlurView } from 'expo-blur';
import { useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';

import {
  useNativeBarRowHeight,
  useNativeHeaderInset,
} from '@/shared/navigation/useNativeHeaderInset';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import { LARGE_TITLE_ROW_HEIGHT } from '@/shared/ui/LargeTitleRow';

interface NativeBarBlurBandProps {
  /** 목록의 contentOffset.y(useFloatingHeaderScroll 의 것) */
  scrollY: Animated.Value;
}

/** 바 줄 밑으로 띠를 더 내리는 만큼 — 카톡은 바 줄에서 짧게 끝난다 */
const BAND_EXTENSION = 8;

/**
 * **스크롤하면 나타나는 상단 블러 띠** — 상태 바 + 바 줄을 꽉 채운 서리 유리(카톡 채팅방 상단, PM 2026-09-26 02:31 스샷
 * "스크롤 내리면 이렇게 그냥 상단 만들어라"). 정지 땐 투명해 큰 제목 줄이 또렷하고, 제목 줄이 밀려 올라가면
 * 바의 작은 제목(useFadingNativeTitle)과 같은 구간에 페이드인한다 — 네이티브 드라이버 불투명도.
 *
 * iOS 26 시스템 scroll edge effect(`topEdgeEffect`·react-native-screens 자동 적용)는 우리 구조에서 상태 바 밑에만 얇게
 * 걸리거나(#733) 영역을 늘리면 제목 위치와 얽혔다(#735~#737). 이 띠는 화면 안 절대 배치라 예측 가능하다.
 * 투명 시스템 바(NativeMainTabs)의 작은 제목은 화면 위 층이라 이 띠 위에 그려진다. 시스템 탭 바 갈래에서만 그린다
 */
export default function NativeBarBlurBand({ scrollY }: NativeBarBlurBandProps) {
  const statusInset = useNativeHeaderInset();
  const rowHeight = useNativeBarRowHeight();
  const height = statusInset + rowHeight + BAND_EXTENSION;
  const opacity = useMemo(() => {
    // 정지 오프셋 = −(상태 바 + 바 줄). 제목 줄이 절반 밀려 나갈 때 시작해 다 나가면 1
    const rest = -(statusInset + rowHeight);
    return scrollY.interpolate({
      inputRange: [rest + LARGE_TITLE_ROW_HEIGHT * 0.5, rest + LARGE_TITLE_ROW_HEIGHT],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY, statusInset, rowHeight]);

  if (!HAS_NATIVE_TAB_BAR) return null;
  return (
    <Animated.View style={[styles.band, { height, opacity }]} pointerEvents="none">
      <BlurView style={StyleSheet.absoluteFill} tint="systemChromeMaterialLight" intensity={100} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
});
