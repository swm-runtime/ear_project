import { useMutation } from '@tanstack/react-query';

import { withdrawUser } from '../api/withdrawal.api';

/**
 * 회원 탈퇴(auth-api.md 4.7) — Idempotency-Key는 호출자가 시도 단위로 발급한다
 * (`useWithdrawalScreen`이 소유한다. 이메일 발송·온보딩 완료와 같은 관례).
 */
export const useWithdrawMutation = () => useMutation({ mutationFn: withdrawUser });
