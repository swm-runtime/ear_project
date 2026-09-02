import { useQuery } from '@tanstack/react-query';

import { careerKeys, fetchJobCategories } from '../api/career.api';

/**
 * 직군 목록 조회 — 커리어 정보 화면과 온보딩 2단계가 같은 목록·같은 캐시를 쓴다
 * (career-api.md 4.3 — 클라이언트 상수 금지. 같은 계약을 두 벌 두면 두 화면의 선택지가
 * 어긋난다. 온보딩 쪽 교체는 티켓 onboarding-job-categories-server-list가 소유한다).
 */
export const useJobCategoriesQuery = () =>
  useQuery({
    queryKey: careerKeys.jobCategories(),
    queryFn: fetchJobCategories,
  });
