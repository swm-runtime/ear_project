import { useQuery } from '@tanstack/react-query';

import { fetchOnboardingState, onboardingKeys } from '../api/onboarding.api';

/** 재개 지점 판정의 단일 소스(onboarding-api.md 4.1) — 온보딩 진입 시 항상 새로 묻는다 */
export const useOnboardingStateQuery = () =>
  useQuery({
    queryKey: onboardingKeys.state(),
    queryFn: fetchOnboardingState,
    staleTime: 0,
    gcTime: 0,
  });
