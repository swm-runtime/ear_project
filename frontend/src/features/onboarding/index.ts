/**
 * onboarding feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 onboarding에 접근한다.
 */
export { default as TopicSelectScreen } from './screens/TopicSelectScreen';
export { default as CareerScreen } from './screens/CareerScreen';
export { default as PickScreen } from './screens/PickScreen';
export { default as FirstDripWaitingScreen } from './screens/FirstDripWaitingScreen';
export { default as CompleteScreen } from './screens/CompleteScreen';
export { useOnboardingStateQuery } from './hooks/useOnboardingStateQuery';
export { useOnboardingStore } from './store/onboarding.store';
export { exitOnboarding } from './services/onboarding-exit.service';
export { ONBOARDING_COPY } from './onboarding.copy';
export type { OnboardingStackParamList, OnboardingState, OnboardingStep } from './onboarding.types';
// 연차 구간 enum — 커리어 값의 원 정의를 재사용한다(career.md 3장, profile 요약 표시가 쓴다)
export type { YearsOfExperience } from './onboarding.types';
