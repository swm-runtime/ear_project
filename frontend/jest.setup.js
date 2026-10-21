/* global jest */
// 테스트는 기기 로캘과 무관하게 한국어로 돈다 — 기존 테스트가 한국어 문구를 단언한다(KAN-194).
// 영어 카피는 각 테스트가 `localized(..., 'en')` 처럼 언어를 직접 넘겨 확인한다
jest.mock('@/shared/i18n/locale', () => ({
  ...jest.requireActual('@/shared/i18n/locale'),
  APP_LANGUAGE: 'ko',
}));

// expo-video 는 jest 환경에서 네이티브 클래스를 못 찾아 import 만으로 터진다. 스플래시(auth)만 쓰지만 auth 공개 API
// (`@/features/auth`)를 거치는 모든 테스트가 끌어온다 — 시장 값(`selectMarket`)을 읽는 구독 고지(KAN-196)부터 프로필까지
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: () => {}, pause: () => {}, release: () => {} }),
  VideoView: () => null,
}));
