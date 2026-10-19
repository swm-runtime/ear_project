import { OnboardingStep, UserMarket } from '../user.enum';

/**
 * 시장별 온보딩 화면 단계(`global-api.md` 4.4) — 담기 단계는 2026-10-11에 없어졌다(onboarding.md 3).
 * 온보딩 상태 조회와 시장 전환 응답(4.11 — 재온보딩 단계)이 함께 쓴다.
 */
export function onboardingStepsFor(market: UserMarket): OnboardingStep[] {
  return market === UserMarket.GLOBAL
    ? [OnboardingStep.TOPIC]
    : [OnboardingStep.TOPIC, OnboardingStep.CAREER];
}
