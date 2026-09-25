import { HeaderHeightContext } from '@react-navigation/elements';
import { useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/**
 * iOS 26 시스템 탭의 **투명 내비게이션 바 줄 높이**(상태 바 제외, 보통 44) — 콘텐츠 안 큰 제목 줄은 이 줄 자리에 앉는다.
 * 애플 뮤직은 큰 제목이 상태 바 바로 밑이다(PM 2026-09-26 00:52 "위쪽에 공간 너무 많다" — 빈 바 줄만큼 내려가 있었다).
 * 목록의 제목 줄은 `useNativeBarPullStyle` 로 이만큼 올려 앉히고, 바의 작은 제목 페이드(useFadingNativeTitle)는 이 값을 더한 정지
 * 오프셋을 쓴다. JS 탭 바 갈래(바가 없다)에서는 0. `useHeaderHeight` 는 컨텍스트가 없으면 던지므로 직접 읽는다
 */
export const useNativeBarRowHeight = (): number => {
  const height = useContext(HeaderHeightContext);
  const insets = useSafeAreaInsets();
  if (!HAS_NATIVE_TAB_BAR || height === undefined) return 0;
  return Math.max(0, height - insets.top);
};

/**
 * 스크롤 뷰가 아닌 상태 화면(스켈레톤·전체 에러·고정 머리 줄)이 비울 위쪽 — 상태 바만. 바 줄은 제목 줄이 차지한다.
 * 스크롤 뷰는 `contentInsetAdjustmentBehavior="automatic"` + 제목 줄의 `useNativeBarPullStyle` 이 같은 결과를 낸다
 */
export const useNativeHeaderInset = (): number => {
  const insets = useSafeAreaInsets();
  return HAS_NATIVE_TAB_BAR ? insets.top : 0;
};

/**
 * 목록 첫 줄(큰 제목 줄 묶음)에 준다 — `automatic` 이 비운 바 높이(상태 바 + 바 줄)는 **그대로 두고** 제목 줄만 바 줄만큼
 * 위로 올려 상태 바 바로 밑에 앉힌다. 인셋을 줄이면(contentInset −44, #733) 바 밑 scroll edge 블러 영역도 같이 줄어
 * 스크롤 때 바의 작은 제목이 콘텐츠에 가렸다(PM 2026-09-26 01:55). 정지 상태엔 블러가 없어(edge effect 는 콘텐츠가
 * 가장자리를 넘을 때만) 제목이 또렷하고, 내리면 블러가 바 줄까지 내려온다 — 애플 뮤직과 같다
 */
export const useNativeBarPullStyle = (): { marginTop: number } | undefined => {
  const rowHeight = useNativeBarRowHeight();
  return rowHeight > 0 ? { marginTop: -(rowHeight + BAR_BLUR_EXTENSION) } : undefined;
};

/**
 * 바 밑 블러를 바 줄보다 **이만큼 더 아래로** 내린다(PM 2026-09-26 02:12 "블러가 더 아래로 내려오게"). 블러 영역은 스크롤 뷰의
 * 조정된 인셋이라 contentInset 으로 늘리고, 제목 줄은 그만큼 더 올려 자리를 지킨다(useNativeBarPullStyle)
 */
export const BAR_BLUR_EXTENSION = 96;

/** 시스템 탭의 스크롤 뷰에 펼친다 — 블러 영역을 BAR_BLUR_EXTENSION 만큼 늘린다. JS 탭 바 갈래에서는 빈 객체 */
export const useNativeBarBlurProps = (): { contentInset?: { top: number } } => {
  const rowHeight = useNativeBarRowHeight();
  return rowHeight > 0 ? { contentInset: { top: BAR_BLUR_EXTENSION } } : {};
};
