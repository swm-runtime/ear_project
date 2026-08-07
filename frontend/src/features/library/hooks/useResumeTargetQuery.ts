import { useQuery } from '@tanstack/react-query';

import { fetchResumeTarget, libraryKeys } from '../api/library.api';

/** 앱 실행 시 미니플레이어 복원 대상(library-api.md 4.3). 대상 없음(null)도 정상 응답이다 */
export const useResumeTargetQuery = () =>
  useQuery({
    queryKey: libraryKeys.resume(),
    queryFn: fetchResumeTarget,
  });
