import { useQuery } from '@tanstack/react-query';

import { fetchMyInterests, interestKeys } from '../api/interest.api';

/**
 * 현재 관심사 조회(interest-management-api.md 4.2) — 화면 진입 시 주제 목록과 병렬로 호출한다.
 * 편집 화면의 기준(baseline)이므로 진입마다 새로 조회한다 — 다른 기기의 저장을 재동기화한다
 * (last-write-wins — interest-management.md 7장).
 */
export const useMyInterestsQuery = () =>
  useQuery({
    queryKey: interestKeys.mine(),
    queryFn: fetchMyInterests,
    // 이전 진입의 캐시로 편집을 시작하지 않는다 — 저장은 전체 교체라 낡은 기준이 곧 잘못된 저장이 된다
    staleTime: 0,
  });
