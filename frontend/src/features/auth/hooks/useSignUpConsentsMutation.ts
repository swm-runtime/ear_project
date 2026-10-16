import { useMutation } from '@tanstack/react-query';

import { fetchSignUpConsents } from '../api/auth.api';

/** A21 → A4 사이 가입 동의 목록 재조회(PM 2026-10-16). 조회지만 POST 라 mutation 으로 다룬다(캐시하지 않는다) */
export const useSignUpConsentsMutation = () =>
  useMutation({
    mutationFn: fetchSignUpConsents,
  });
