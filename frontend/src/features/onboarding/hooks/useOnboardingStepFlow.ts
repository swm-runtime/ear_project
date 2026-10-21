import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { fetchOnboardingState, onboardingKeys } from '../api/onboarding.api';
import type { OnboardingScreenStep, OnboardingStackParamList } from '../onboarding.types';
import {
  DEFAULT_ONBOARDING_STEPS,
  nextOnboardingStep,
  onboardingStepPosition,
} from '../services/onboarding-steps';

/** 화면 단계 → 온보딩 스택의 화면 */
const STEP_ROUTES: Record<OnboardingScreenStep, 'Topic' | 'Career'> = {
  topic: 'Topic',
  career: 'Career',
};

/**
 * 화면 단계 목록 — 내비게이터가 받아 둔 `GET /onboarding/state` 캐시에서 **읽기만** 한다(`enabled: false` — 새로 묻지 않는다).
 * 서버 상태라 store 에 옮기지 않는다(convention.md 4.2). 내비게이터는 상태를 받은 뒤에만 단계 화면을 그리므로 값은 늘 있다 —
 * 그래도 비면 종전 단계로 본다. gcTime 은 내비게이터와 같은 0 — 관찰자가 더 긴 값을 주면 캐시 수명이 늘어난다.
 */
const useOnboardingSteps = (): readonly OnboardingScreenStep[] => {
  const { data } = useQuery({
    queryKey: onboardingKeys.state(),
    queryFn: fetchOnboardingState,
    enabled: false,
    staleTime: 0,
    gcTime: 0,
    select: (state) => state.steps,
  });
  return data ?? DEFAULT_ONBOARDING_STEPS;
};

/**
 * 단계 화면의 진행 — 서버 `steps[]`대로 다음 화면을 고르고 단계 표시 숫자를 준다(global-api.md 4.4, KAN-195).
 * 다음 단계가 없으면 입력이 끝난 것이라 완료 대기(O13)로 간다 — 완료 요청은 그 화면이 쏜다.
 * 시장·언어로 단계를 추론하지 않는다.
 */
export const useOnboardingStepFlow = (current: OnboardingScreenStep) => {
  const navigation = useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const steps = useOnboardingSteps();

  const goToNextStep = useCallback(() => {
    const next = nextOnboardingStep(steps, current);
    if (next === null) {
      // 완료 이후 구간은 뒤로 올 수 없다(reset — onboarding-uiux.md 4.5)
      navigation.reset({ index: 0, routes: [{ name: 'FirstDripWaiting' }] });
      return;
    }
    navigation.navigate(STEP_ROUTES[next]);
  }, [navigation, steps, current]);

  return {
    /** 단계 표시("1/2 단계") — 분모는 서버 배열 길이(GLOBAL "1/1") */
    position: onboardingStepPosition(steps, current),
    goToNextStep,
  };
};
