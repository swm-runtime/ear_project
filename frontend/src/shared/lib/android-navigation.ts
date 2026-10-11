/**
 * Android 시스템 내비게이션 방식 — 아래 안전영역(edge-to-edge 의 insets.bottom) 높이로 가른다.
 * 3버튼·2버튼 바는 48dp 안팎, 제스처 바는 16~24dp(핸들 숨기면 ~0)라 그 사이 32dp 를 경계로 둔다.
 * 시스템 설정값(navigation_mode)을 읽으려면 네이티브 모듈이 필요해 높이로 판정한다 — 표시 위치에만 쓴다
 */
export type AndroidNavigationMode = 'gesture' | 'buttons';

export const ANDROID_BUTTON_BAR_MIN_INSET = 32;

export const androidNavigationModeOf = (bottomInset: number): AndroidNavigationMode =>
  bottomInset >= ANDROID_BUTTON_BAR_MIN_INSET ? 'buttons' : 'gesture';
