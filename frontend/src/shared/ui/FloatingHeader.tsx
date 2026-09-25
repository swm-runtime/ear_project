import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

interface FloatingHeaderProps {
  children: ReactNode;
  /** 자식이 차지한 높이(안전영역 제외) — 목록이 이만큼 위를 비운다(useFloatingHeaderInset) */
  onHeightChange: (height: number) => void;
}

/**
 * 화면 위에 **떠 있는 머리 줄**(검색창·세그먼트·칩) — 배경 없이 목록 위에 절대 배치돼 콘텐츠가 그 밑으로 흐른다
 * (2026-09-24 PM "배경을 없애버리자" — iOS 26 처럼 유리 컨트롤이 콘텐츠 위에 뜬다. 탭 바와 같은 문법).
 * 안전영역(상태 바)은 여기서 채우고, 자식의 높이만 올려 목록이 `paddingTop` 으로 비운다.
 * 상태 바 밑 블러는 여기서 그리지 않는다 — iOS 26 시스템 scroll edge effect 가 목록에 직접 건다
 * (`useSystemScrollEdgeEffect`). JS 로 만든 띠·마스크 블러는 계단·얼룩으로 폐기했다(2026-09-25).
 */
export default function FloatingHeader({ children, onHeightChange }: FloatingHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
      <View onLayout={(e) => onHeightChange(e.nativeEvent.layout.height)} pointerEvents="box-none">
        {children}
      </View>
    </View>
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
