import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/**
 * iOS 26 시스템 탭 갈래의 **상단 바 줄 높이**(상태 바 제외) — iOS 내비게이션 바의 44. 네이티브 바는 쓰지 않는다
 * (투명해도 UINavigationBar 가 터치를 먹어 그 밑 제목 줄의 링·필터가 안 눌렸다 — PM 2026-09-26 17:42). 블러 띠와
 * 작은 제목은 `NativeBarBlurBand` 가 이 높이로 직접 그린다
 */
export const NATIVE_BAR_ROW_HEIGHT = 44;

export const useNativeBarRowHeight = (): number => (HAS_NATIVE_TAB_BAR ? NATIVE_BAR_ROW_HEIGHT : 0);

/**
 * 스크롤 뷰가 아닌 상태 화면(스켈레톤·전체 에러·고정 머리 줄)이 비울 위쪽 — 상태 바만. 바가 없으니 콘텐츠(큰 제목 줄)는
 * 상태 바 바로 밑에서 시작한다. 스크롤 뷰는 `contentInsetAdjustmentBehavior="automatic"` 이 같은 결과를 낸다(DOCK_SCROLL_PROPS).
 * JS 탭 바 갈래에서는 0(FloatingHeader 가 상태 바를 채운다)
 */
export const useNativeHeaderInset = (): number => {
  const insets = useSafeAreaInsets();
  return HAS_NATIVE_TAB_BAR ? insets.top : 0;
};
