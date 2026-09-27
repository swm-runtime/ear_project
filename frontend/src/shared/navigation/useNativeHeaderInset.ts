import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/**
 * iOS 26 시스템 탭 갈래의 **상단 바 줄 높이**(상태 바 제외) — iOS 내비게이션 바의 44. 라이브러리·탐색·설정은 투명
 * 시스템 바를 쓰고(바 밑 블러 = 시스템 scroll edge effect, PM 2026-09-28 01:40), 큰 제목 줄은 **바 밑**에서 시작한다 —
 * 바 줄 자리에 올려 앉히면 UINavigationBar 가 그 자리의 터치를 먹어 링·필터가 안 눌렸다(09-26 17:42)
 */
export const NATIVE_BAR_ROW_HEIGHT = 44;

export const useNativeBarRowHeight = (): number => (HAS_NATIVE_TAB_BAR ? NATIVE_BAR_ROW_HEIGHT : 0);

/**
 * 스크롤 뷰가 아닌 상태 화면(스켈레톤·전체 에러·검색 겹침)이 비울 위쪽 — 상태 바 + 바 줄. 스크롤 뷰는
 * `contentInsetAdjustmentBehavior="automatic"` 이 같은 결과를 낸다(DOCK_SCROLL_PROPS). JS 탭 바 갈래에서는 0
 * (FloatingHeader 가 상태 바를 채운다)
 */
export const useNativeHeaderInset = (): number => {
  const insets = useSafeAreaInsets();
  return HAS_NATIVE_TAB_BAR ? insets.top + NATIVE_BAR_ROW_HEIGHT : 0;
};
