import { useMutation, useQueryClient } from '@tanstack/react-query';

import { emailVerificationKeys, verifyEmailCode } from '../api/email-verification.api';
import { notifyEmailVerified } from '../services/email-verified-listener';

/**
 * 코드 검증(auth-api.md 4.10) — 성공은 서버가 users 저장까지 끝냈다는 뜻이다. 성공 시:
 * - 진행 중 인증 캐시를 비운다 — 검증 완료 건은 active: false다(auth-api.md 4.9)
 * - 인증 성공을 통지한다 — 프로필·설정 요약 invalidate(복귀 화면의 값·배지 갱신,
 *   auth-uiux.md 4.15)는 app/bootstrap이 주입한 리스너가 수행한다
 */
export const useVerifyEmailCodeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyEmailCode,
    onSuccess: (result) => {
      queryClient.setQueryData(emailVerificationKeys.active(), null);
      notifyEmailVerified(result);
    },
  });
};
