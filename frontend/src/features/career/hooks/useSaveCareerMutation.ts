import { useMutation, useQueryClient } from '@tanstack/react-query';

import { careerKeys, saveMyCareer } from '../api/career.api';
import { notifyCareerSaved } from '../services/career-saved-listener';

/**
 * 커리어 저장(career-api.md 4.2 — 3필드 전체 교체 PUT). 성공 시:
 * - 커리어 캐시를 응답(정규화 결과 포함)으로 확정한다 — 재조회 없이 화면과 서버가 일치한다
 * - 저장 성공을 통지한다 — 프로필 요약 invalidate(profile/index.ts의 갱신 계약: 저장 성공에만,
 *   [나가기]·뒤로가기에는 호출하지 않는다)는 app/bootstrap이 주입한 리스너가 수행한다.
 */
export const useSaveCareerMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveMyCareer,
    onSuccess: (career) => {
      queryClient.setQueryData(careerKeys.mine(), career);
      notifyCareerSaved();
    },
  });
};
