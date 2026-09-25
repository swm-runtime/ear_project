import { HeaderHeightContext } from '@react-navigation/elements';
import { useContext } from 'react';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/**
 * iOS 26 시스템 탭의 **투명 내비게이션 바 높이**(상태 바 포함) — 스크롤 뷰가 아닌 상태 화면(스켈레톤·전체 에러·고정 머리 줄)이
 * 이만큼 위를 비운다. 스크롤 뷰는 `contentInsetAdjustmentBehavior="automatic"` 이 알아서 비운다(DOCK_SCROLL_PROPS).
 * 시스템 탭 바가 아닌 갈래(JS 탭 바 — 바가 없다)에서는 0. `useHeaderHeight` 는 컨텍스트가 없으면 던지므로 직접 읽는다
 */
export const useNativeHeaderInset = (): number => {
  const height = useContext(HeaderHeightContext);
  return HAS_NATIVE_TAB_BAR ? (height ?? 0) : 0;
};
