import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useToastStore } from '@/shared/ui/toast.store';

import { submitInviteCode } from '../api/subscription.api';
import { notifySubscriptionChanged } from '../services/subscription-sync';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { MySubscription } from '../subscription.types';

const COPY = SUBSCRIPTION_COPY.invite;

/** 서버 상한(subscription-api.md 4.8-1 — 빈 값·64자 초과는 400). 넘는 값은 보내기 전에 막는다 */
export const INVITE_CODE_MAX_LENGTH = 64;

/** 에러 → 문구(subscription-api.md 5장 그대로). 판정은 서버가 했다 — 앱은 옮겨 적기만 한다 */
export const inviteErrorMessage = (error: unknown): string => {
  if (!isApiError(error)) return COPY.unknown;
  switch (error.errorCode) {
    case ERROR_CODES.INVITE_CODE_NOT_FOUND:
      return COPY.notFound;
    case ERROR_CODES.INVITE_CODE_EXPIRED:
      return COPY.expired;
    case ERROR_CODES.INVITE_CODE_EXHAUSTED:
      return COPY.exhausted;
    case ERROR_CODES.INVITE_CODE_ALREADY_USED:
      return COPY.alreadyUsed;
    case ERROR_CODES.INVITE_GRANT_ALREADY_ACTIVE:
      return COPY.grantAlreadyActive;
    case ERROR_CODES.VALIDATION_FAILED:
      // 빈 값·64자 초과 — 앱이 먼저 막으므로 드물다. 서버가 "없는 코드"로 다루는 값과 같은 문구로 둔다
      return COPY.notFound;
    case ERROR_CODES.NETWORK_ERROR:
    case ERROR_CODES.TIMEOUT:
      return COPY.network;
    default:
      // 레이트 리밋(분당 10회)은 api-client 가 Retry-After 로 다시 보낸 뒤에도 남은 경우다 — 코드가 아니라 대기 값으로 안다
      return error.retryAfterSec !== null ? COPY.rateLimited : COPY.unknown;
  }
};

/** 성공 안내 — 응답의 grant 로 만든다. grant 가 없으면(서버가 표시를 바꾸지 않았다) 짧은 안내 */
export const inviteSuccessMessage = (subscription: MySubscription): string => {
  const grant = subscription.plan.grant;
  return grant === null
    ? COPY.successFallback
    : COPY.success(grant.name, grant.planName, grant.lastDate);
};

/**
 * 이벤트 코드 입력 화면(KAN-182)의 로직 소유자. 결제 UI 플래그와 무관하다 — 지급은 스토어 결제가 아니다.
 * 성공하면 응답 본문으로 구독 캐시를 갱신하고(앱이 4.2 를 다시 부르지 않는다) 프로필·설정·라이브러리 요약을 다시 받는다
 * (결제·복원과 같은 배선 — notifySubscriptionChanged). 실패하면 입력값을 남긴 채 문구만 보인다
 */
export const useInviteCodeScreen = () => {
  const navigation = useNavigation();
  const showToast = useToastStore((s) => s.show);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: string) => submitInviteCode(value),
    onSuccess: (subscription) => {
      notifySubscriptionChanged(subscription);
      showToast(inviteSuccessMessage(subscription));
      navigation.goBack();
    },
    onError: (error) => setErrorMessage(inviteErrorMessage(error)),
  });

  // 대소문자·앞뒤 공백은 서버가 정규화한다 — 앱은 빈 값만 거르고 원문 그대로 보낸다
  const canSubmit = code.trim().length > 0 && !mutation.isPending;

  const changeCode = (value: string) => {
    setCode(value);
    if (errorMessage !== null) setErrorMessage(null);
  };

  const submit = () => {
    if (!canSubmit) return;
    setErrorMessage(null);
    mutation.mutate(code);
  };

  return {
    code,
    changeCode,
    submit,
    canSubmit,
    isSubmitting: mutation.isPending,
    errorMessage,
    goBack: () => navigation.goBack(),
  };
};
