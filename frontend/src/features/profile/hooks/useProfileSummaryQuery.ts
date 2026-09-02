import { useQuery } from '@tanstack/react-query';

import { fetchProfileSummary, profileKeys } from '../api/profile.api';

/**
 * 프로필 요약 조회 — "캐시를 두지 않는다"(profile-api.md 3장)를 staleTime 0 + gcTime 0으로 표현한다.
 * 화면이 마운트된 동안의 invalidate는 기존 data를 유지한 채 백그라운드 재조회가 되므로
 * "전체 스켈레톤 없이 조용히 갱신"(profile-uiux.md 4.9)이 자동으로 성립한다.
 * 하단 탭은 화면을 언마운트하지 않아 탭 전환 중에도 observer가 살아 있다 — gc로 값이 사라지지 않는다.
 */
export const useProfileSummaryQuery = () =>
  useQuery({
    queryKey: profileKeys.summary(),
    queryFn: fetchProfileSummary,
    staleTime: 0,
    gcTime: 0,
  });
