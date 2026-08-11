import { useQuery } from '@tanstack/react-query';

import { fetchTopics, interestKeys } from '../api/interest.api';

/**
 * 주제 목록 조회 — 관심사 관리와 온보딩 1단계가 같은 목록·같은 캐시를 쓴다
 * (interest-management-api.md 4.1 — 같은 계약을 두 벌 두면 두 화면의 선택지가 어긋난다).
 */
export const useTopicsQuery = () =>
  useQuery({
    queryKey: interestKeys.topics(),
    queryFn: fetchTopics,
  });
