/* global jest */
// 테스트는 기기 로캘과 무관하게 한국어로 돈다 — 기존 테스트가 한국어 문구를 단언한다(KAN-194).
// 영어 카피는 각 테스트가 `localized(..., 'en')` 처럼 언어를 직접 넘겨 확인한다
jest.mock('@/shared/i18n/locale', () => ({
  ...jest.requireActual('@/shared/i18n/locale'),
  APP_LANGUAGE: 'ko',
}));
