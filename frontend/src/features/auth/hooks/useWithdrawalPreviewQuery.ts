import { useQuery } from '@tanstack/react-query';

import { fetchWithdrawalPreview, withdrawalKeys } from '../api/withdrawal.api';

/**
 * A7 진입 조회(auth-api.md 4.6) — 화면 구성(보존 섹션·만료 동의)을 가르는 서버 판정이다.
 * 캐시로 먼저 그리지 않는다(`staleTime: 0`): 안내 문구가 사실과 달라지면 그 자체가 법적
 * 고지 오류라, 결제·구독 상태가 바뀐 뒤의 재진입에서 낡은 값을 보여주면 안 된다.
 */
export const useWithdrawalPreviewQuery = () =>
  useQuery({
    queryKey: withdrawalKeys.preview(),
    queryFn: fetchWithdrawalPreview,
    staleTime: 0,
  });
