import { BlurView } from 'expo-blur';
import { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import {
  useNativeBarRowHeight,
  useNativeHeaderInset,
} from '@/shared/navigation/useNativeHeaderInset';
import { theme } from '@/shared/theme';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import { LARGE_TITLE_ROW_HEIGHT } from '@/shared/ui/LargeTitleRow';

interface NativeBarBlurBandProps {
  /** 목록의 contentOffset.y(useFloatingHeaderScroll 의 것) */
  scrollY: Animated.Value;
  /** 바 줄 가운데에 페이드인하는 작은 제목 — 콘텐츠 안 큰 제목 줄이 밀려 올라가면 나타난다 */
  title: string;
}

/** 띠의 아래 끝 — 바 줄 끝보다 이만큼 위(음수). 03:19 PM "범위 조금만 올리자 너무 내려와 있다"(+8 → −8 → −16 03:39) */
const BAND_EXTENSION = -16;
/** 바 줄 가운데보다 이만큼 위 — 띠 아래 끝을 바 줄보다 올려서 제목도 같이 올린다(03:19 PM "글자를 더 올리자" −6 → 18:02 "조금 올리는 거" −12) */
const TITLE_LIFT = -12;

/**
 * **스크롤하면 나타나는 상단 블러 띠 + 작은 제목** — 상태 바 + 바 줄을 꽉 채운 흰 서리 유리(블러 + 흰 35%, 카톡 채팅방 상단,
 * PM 2026-09-26 02:31 스샷 "스크롤 내리면 이렇게 그냥 상단 만들어라"). 정지 땐 투명해 큰 제목 줄이 또렷하고, 제목 줄이
 * 밀려 올라가면 띠와 작은 제목이 같이 페이드인한다 — 네이티브 드라이버 불투명도.
 *
 * 네이티브 내비게이션 바는 쓰지 않는다 — 투명해도 UINavigationBar 가 터치를 먹어 그 밑 제목 줄의 링·필터가 안 눌렸다
 * (17:42 PM). 그래서 작은 제목도 여기서 그린다(iOS 바 제목 17pt semibold, 바 줄 가운데). 띠는 화면 안 절대 배치이고
 * `pointerEvents="none"` 이라 아무것도 가로채지 않는다. 시스템 탭 바 갈래에서만 그린다
 */
export default function NativeBarBlurBand({ scrollY, title }: NativeBarBlurBandProps) {
  const statusInset = useNativeHeaderInset();
  const rowHeight = useNativeBarRowHeight();
  const height = statusInset + rowHeight + BAND_EXTENSION;
  const opacity = useMemo(() => {
    // 정지 오프셋 = −상태 바(automatic 인셋, 바 없음). 제목 줄이 절반 밀려 나갈 때 시작해 다 나가면 1
    const rest = -statusInset;
    return scrollY.interpolate({
      inputRange: [rest + LARGE_TITLE_ROW_HEIGHT * 0.5, rest + LARGE_TITLE_ROW_HEIGHT],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY, statusInset]);

  if (!HAS_NATIVE_TAB_BAR) return null;
  return (
    <Animated.View style={[styles.band, { height, opacity }]} pointerEvents="none">
      <BlurView style={StyleSheet.absoluteFill} tint="light" intensity={100} />
      {/* 블러만으론 밑 썸네일이 다 비쳐 작은 제목이 겹쳤다(02:59 실기기) — 카톡처럼 흰 서리에 가깝게 틴트를 얹는다 */}
      <View style={[StyleSheet.absoluteFill, styles.frost]} />
      <View style={[styles.titleRow, { top: statusInset, height: rowHeight }]}>
        <Animated.Text
          style={[styles.title, { transform: [{ translateY: TITLE_LIFT }] }]}
          numberOfLines={1}
        >
          {title}
        </Animated.Text>
      </View>
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
  frost: {
    // 03:19 PM "틴트 줄이고" — 72% → 50% → 35%(03:39)
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  titleRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // iOS 바 제목 — 17pt semibold
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
