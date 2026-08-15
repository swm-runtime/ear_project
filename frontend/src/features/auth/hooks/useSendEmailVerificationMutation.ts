import { useMutation, useQueryClient } from '@tanstack/react-query';

import { emailVerificationKeys, sendEmailVerification } from '../api/email-verification.api';

/**
 * 인증 코드 발송(auth-api.md 4.8) — Idempotency-Key는 호출자가 시도 단위로 발급한다.
 * 성공 시 진행 중 인증 캐시를 응답으로 확정한다 — 발송 직후 재진입해도 4.9 재조회 없이
 * 같은 건을 이어서 본다.
 */
export const useSendEmailVerificationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendEmailVerification,
    onSuccess: (verification) => {
      queryClient.setQueryData(emailVerificationKeys.active(), verification);
    },
  });
};
