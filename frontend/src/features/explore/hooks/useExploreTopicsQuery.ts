import { useQuery } from '@tanstack/react-query';

import { exploreKeys, fetchExploreTopics } from '../api/explore.api';

/** 주제 칩 목록 — 관심 주제 우선 정렬은 서버 소유(explore.md 4.2). 실패해도 피드는 그린다 */
export const useExploreTopicsQuery = () =>
  useQuery({
    queryKey: exploreKeys.topics(),
    queryFn: fetchExploreTopics,
  });
