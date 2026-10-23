/**
 * **투명 시스템 바** — 스크롤하면 바 밑 블러를 시스템 scroll edge effect 가 그린다(PM 2026-09-28 01:40 "애플에서 기본적으로
 * 제공하는거로" — 그리던 서리 띠 NativeBarBlurBand 는 걷었다). 큰 제목·오른쪽 캡슐은 화면이
 * `useSystemLargeTitle` 로 건다(iOS 26 .inline — 큰 제목과 바 버튼이 같은 줄, 09-28).
 * 탭 화면(라이브러리)과 탐색 탭 안 스택의 홈(ExploreStack)이 같이 쓴다
 */
export const TRANSPARENT_BAR = {
  headerShown: true,
  headerTransparent: true,
  headerShadowVisible: false,
  title: '',
} as const;
