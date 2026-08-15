import { useQuery } from '@tanstack/react-query';

import { emailVerificationKeys, fetchActiveVerification } from '../api/email-verification.api';

/**
 * 진행 중 인증 조회(auth-api.md 4.9) — 코드 입력 중 앱이 종료됐다가 재진입한 경우
 * 재발송 없이 이어서 입력하기 위한 것이다. 항상 서버 값으로 시작한다 —
 * 남은 시간을 로컬 타이머로 복원하지 않는다(auth.md 7).
 */
export const useActiveEmailVerificationQuery = () =>
  useQuery({
    queryKey: emailVerificationKeys.active(),
    queryFn: fetchActiveVerification,
    // 진행 중 인증은 초 단위로 낡는 값이다 — 진입 때마다 서버에서 다시 읽는다
    staleTime: 0,
    gcTime: 0,
  });
