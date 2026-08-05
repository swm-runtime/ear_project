import { useQuery } from '@tanstack/react-query';

import { fetchOnboardingTopics, onboardingKeys } from '../api/onboarding.api';

export const useOnboardingTopicsQuery = () =>
  useQuery({
    queryKey: onboardingKeys.topics(),
    queryFn: fetchOnboardingTopics,
  });
