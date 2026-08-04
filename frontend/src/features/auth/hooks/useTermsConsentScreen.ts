import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { AUTH_COPY } from '../auth.copy';
import type { AuthStackParamList, ConsentType, RequiredConsent } from '../auth.types';
import { useSignUpMutation } from './useSignUpMutation';
import { sessionService } from '../services/session.service';

interface TermsConsentParams {
  signupToken: string;
  requiredConsents: RequiredConsent[];
}

export const useTermsConsentScreen = ({ signupToken, requiredConsents }: TermsConsentParams) => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'TermsConsent'>>();
  const showToast = useToastStore((s) => s.show);
  const signUpMutation = useSignUpMutation();
  /** 동의 체크 상태 — 필수·선택 모두 기본값 해제(auth-uiux.md 4.3) */
  const [checkedMap, setCheckedMap] = useState<Partial<Record<ConsentType, boolean>>>({});

  const items = requiredConsents.map((consent) => ({
    ...consent,
    label: AUTH_COPY.consent.label[consent.consentType],
    description:
      consent.consentType === 'marketing' ? AUTH_COPY.consent.marketingDescription : null,
    isChecked: checkedMap[consent.consentType] ?? false,
  }));

  const isAllChecked = items.every((item) => item.isChecked);
  /** 필수 전체 체크 시에만 [동의하고 시작하기] 활성(auth.md 4.1) */
  const canSubmit = items.filter((item) => item.isRequired).every((item) => item.isChecked);

  const toggleConsent = (consentType: ConsentType) => {
    setCheckedMap((prev) => ({ ...prev, [consentType]: !(prev[consentType] ?? false) }));
  };

  const toggleAll = () => {
    const next = !isAllChecked;
    setCheckedMap(
      Object.fromEntries(requiredConsents.map((consent) => [consent.consentType, next])),
    );
  };

  const handleViewPress = (consentType: ConsentType) => {
    // TODO(auth): 약관 문서 URL 확정 후 인앱 브라우저로 연다(auth-uiux.md 4.3)
    logger.warn('[auth] consent document url not decided yet:', consentType);
  };

  const handleSubmit = async () => {
    if (!canSubmit || signUpMutation.isPending) return;
    try {
      const deviceId = await getDeviceId();
      const session = await signUpMutation.mutateAsync({
        signupToken,
        deviceId,
        consents: requiredConsents.map((consent) => ({
          consentType: consent.consentType,
          version: consent.version,
          isAgreed: checkedMap[consent.consentType] ?? false,
        })),
      });
      // 이 시점에 계정이 생성됐다. 화면 전환은 RootNavigator가 세션 상태로 분기한다(온보딩 첫 단계)
      await sessionService.startSession(session.tokens, session.user);
    } catch (error) {
      if (isApiError(error)) {
        // signup_token 만료·약관 개정 → 제공자 인증부터 재시작(auth-api.md 5장)
        if (
          error.errorCode === ERROR_CODES.AUTH_SIGNUP_TOKEN_EXPIRED ||
          error.errorCode === ERROR_CODES.CONSENT_VERSION_STALE
        ) {
          showToast(
            error.errorCode === ERROR_CODES.AUTH_SIGNUP_TOKEN_EXPIRED
              ? AUTH_COPY.consent.signupExpired
              : AUTH_COPY.consent.consentStale,
          );
          navigation.popToTop();
          return;
        }
        showToast(error.message);
        return;
      }
      showToast(AUTH_COPY.loginFailed);
    }
  };

  return {
    items,
    isAllChecked,
    canSubmit,
    isSubmitting: signUpMutation.isPending,
    toggleConsent,
    toggleAll,
    handleViewPress,
    handleSubmit,
  };
};
