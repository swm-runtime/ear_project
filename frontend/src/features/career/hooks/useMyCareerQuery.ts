import { useQuery } from '@tanstack/react-query';

import { careerKeys, fetchMyCareer } from '../api/career.api';

/**
 * 커리어 현재 값 조회(career-api.md 4.1) — 진입 시 직군 목록과 병렬 호출한다(6장).
 * 실패는 화면 진입 차단형이다 — 캐시로 대체해 낡은 값 위에서 편집을 시작하게 하지 않는다.
 */
export const useMyCareerQuery = () =>
  useQuery({
    queryKey: careerKeys.mine(),
    queryFn: fetchMyCareer,
  });
