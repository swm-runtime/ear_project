import { useMutation, useQueryClient } from '@tanstack/react-query';

import { interestKeys, saveMyInterests } from '../api/interest.api';
import { notifyInterestSaved } from '../services/interest-saved-listener';

/**
 * 일괄 저장(interest-management-api.md 4.3). 성공 시:
 * - 관심사 캐시를 응답(저장 후 최종 상태)으로 확정한다 — 재조회 없이 화면과 서버가 일치한다
 * - 저장 성공을 통지한다 — 프로필·설정 요약 invalidate(각 index.ts의 갱신 계약: 저장 성공에만,
 *   [취소]·뒤로가기에는 호출하지 않는다)는 app/bootstrap이 주입한 리스너가 수행한다.
 *   interest가 profileKeys·settingsKeys를 직접 import하면 의존 표(4.4)의 방향과 순환이 된다.
 */
export const useSaveInterestsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveMyInterests,
    onSuccess: (interests) => {
      queryClient.setQueryData(interestKeys.mine(), interests);
      notifyInterestSaved();
    },
  });
};
