import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/**
 * **푸시 화면의 상단**(설정·콘텐츠 상세·공지·관심 주제 …) — iOS 26 시스템 탭 갈래에서는 라이브러리·탐색과 같은 문법으로
 * 맞춘다(PM 2026-09-27 01:42 "설정 페이지도 UI 일관되게"): 시스템 투명 바에는 **뒤로 버튼(iOS 26 유리 원)만**, 제목은
 * 콘텐츠 첫 줄의 큰 제목(`LargeTitleRow`), 스크롤하면 블러 띠 + 작은 제목(`NativeBarBlurBand`). 애플 뮤직의 푸시 화면과 같다.
 *
 * 푸시 화면은 콘텐츠가 바 밑(automatic 인셋)에서 시작하므로 탭 화면에서 바를 끈 이유(바가 제목 줄의 터치를 먹음)가 없다.
 * 시스템 scroll edge 블러는 끈다 — 띠를 우리가 그린다(둘이 겹치면 두 번 뿌옇다).
 * 그 외 플랫폼은 종전대로 화면이 앱바(‹ 제목)를 직접 그린다 — `headerShown: false`.
 */
export const PUSHED_SCREEN_HEADER: NativeStackNavigationOptions = HAS_NATIVE_TAB_BAR
  ? {
      headerShown: true,
      headerTransparent: true,
      headerTitle: '',
      headerBackButtonDisplayMode: 'minimal',
      headerShadowVisible: false,
      scrollEdgeEffects: { top: 'hidden' },
    }
  : { headerShown: false };

/** 화면이 시스템 바를 쓰는가 — 화면은 이 값으로 앱바를 그릴지 큰 제목 줄을 그릴지 가른다 */
export const USES_SYSTEM_PUSHED_HEADER = HAS_NATIVE_TAB_BAR;
