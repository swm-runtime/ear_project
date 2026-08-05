import { useQuery } from '@tanstack/react-query';

import { fetchRecommendations, onboardingKeys } from '../api/onboarding.api';

/**
 * 3단계 추천 9건 조회. 재진입 시 같은 9건 보장은 서버의 결정적 시드가 담당하며(onboarding-api.md 4.5),
 * 클라이언트는 캐시로 같은 화면 상태를 유지할 뿐 순서를 다시 섞지 않는다.
 */
export const useRecommendationsQuery = () =>
  useQuery({
    queryKey: onboardingKeys.recommendations(),
    queryFn: fetchRecommendations,
  });
