/**
 * 백엔드 온보딩 API가 아직 없어 개발 중에는 mock으로 동작한다(api/onboarding.mock.ts).
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_ONBOARDING_API=real 로 전환한다.
 */
export const IS_ONBOARDING_API_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_ONBOARDING_API !== 'real';

/**
 * 첫 드립 대기 상한 폴백(초). 기준값은 서버가 완료 응답으로 내려주며(onboarding-api.md 2),
 * 이 값은 완료 응답이 도착하기 전 구간의 안전장치로만 쓴다 — 로딩 화면에 사용자를 가두지 않는다.
 */
export const FIRST_DRIP_MAX_WAIT_FALLBACK_SEC = 15;
