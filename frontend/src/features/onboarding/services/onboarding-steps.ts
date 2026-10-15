import type { OnboardingScreenStep, OnboardingStep } from '../onboarding.types';

/**
 * 온보딩 화면 단계 — **서버가 주는 `steps[]` 배열대로 화면을 잇는다**(global-api.md 4.4, KAN-195).
 * KR `["topic","career"]`, GLOBAL `["topic"]`(커리어는 한국 직군 분류라 해외 사용자에게 고를 값이 없다).
 * 시장(`market`)·표시 언어로 단계를 추론하지 않는다 — 단계 구성이 바뀔 때 스토어 빌드 없이 서버 배포로 끝나게 하려는 계약이다.
 */

/** 이 앱이 그릴 줄 아는 단계 — 배열 순서가 아니라 "아는 이름" 목록이다(순서는 서버 배열이 정한다) */
const KNOWN_STEPS: readonly OnboardingScreenStep[] = ['topic', 'career'];

/** `steps`가 빠진 응답(배포 전 서버)의 종전 동작 — 주제 → 커리어 */
export const DEFAULT_ONBOARDING_STEPS: readonly OnboardingScreenStep[] = ['topic', 'career'];

const isKnownStep = (value: unknown): value is OnboardingScreenStep =>
  typeof value === 'string' && (KNOWN_STEPS as readonly string[]).includes(value);

/**
 * 응답의 `steps`를 화면 단계 목록으로 정리한다.
 * - 없음(필드 누락·배열 아님) → 종전 동작(`DEFAULT_ONBOARDING_STEPS`)
 * - 모르는 이름(새 앱 버전용 단계)은 건너뛴다 — 그릴 화면이 없다. 중복은 처음 것만 남긴다
 * - 걸러서 하나도 안 남으면 종전 동작 — 단계 0개로는 주제(드립 편성의 유일한 필수 신호)를 받을 수 없다
 */
export const normalizeOnboardingSteps = (raw: unknown): OnboardingScreenStep[] => {
  if (!Array.isArray(raw)) return [...DEFAULT_ONBOARDING_STEPS];
  const steps = raw.filter(isKnownStep).filter((step, index, all) => all.indexOf(step) === index);
  return steps.length > 0 ? steps : [...DEFAULT_ONBOARDING_STEPS];
};

/** `current` 다음에 밟을 단계. `null`이면 입력 단계가 끝났다 — 완료 대기(완료 요청 + 첫 드립)로 간다 */
export const nextOnboardingStep = (
  steps: readonly OnboardingScreenStep[],
  current: OnboardingScreenStep,
): OnboardingScreenStep | null => {
  const index = steps.indexOf(current);
  if (index === -1) return null;
  return steps[index + 1] ?? null;
};

/**
 * 단계 표시("1/2 단계"·"2단계 중 1단계")의 숫자 — 서버 배열 길이가 분모다(GLOBAL은 "1/1").
 * 배열에 없는 단계 화면이 그려지는 경우(재개 경합 등)는 마지막 칸으로 보여 분자가 분모를 넘지 않게 한다.
 */
export const onboardingStepPosition = (
  steps: readonly OnboardingScreenStep[],
  current: OnboardingScreenStep,
): { current: number; total: number } => {
  const total = Math.max(steps.length, 1);
  const index = steps.indexOf(current);
  return { current: index === -1 ? total : index + 1, total };
};

/**
 * 재개 지점(`onboarding_step`) → 시작할 화면 단계. `finish`는 완료 대기 화면이다.
 * 서버의 `pick`(입력 끝)·`done`(완료 직전)은 담기 화면을 뺀 뒤(2026-10-11) 곧바로 완료 대기로 간다.
 * 재개 지점이 배열에 없는 단계면(GLOBAL인데 `career`) 그 단계를 띄우지 않고 배열상 다음 단계로 넘긴다.
 */
export const resumeOnboardingTarget = (
  onboardingStep: OnboardingStep,
  steps: readonly OnboardingScreenStep[],
): OnboardingScreenStep | 'finish' => {
  if (onboardingStep === 'pick' || onboardingStep === 'done') return 'finish';
  if (steps.includes(onboardingStep)) return onboardingStep;
  // 배열에 없는 단계 — 그 단계보다 뒤에 오는 첫 단계(KNOWN_STEPS 순서 기준). 없으면 입력이 끝난 것이다
  const after = KNOWN_STEPS.slice(KNOWN_STEPS.indexOf(onboardingStep) + 1);
  return steps.find((step) => after.includes(step)) ?? 'finish';
};
