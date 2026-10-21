import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { adoptSignupLanguage, APP_LANGUAGE } from '@/shared/i18n/locale';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { AUTH_COPY } from '../auth.copy';
import type {
  AuthStackParamList,
  ContentLanguage,
  Market,
  RequiredConsent,
  SignUpParams,
} from '../auth.types';
import { useSignUpConsentsMutation } from './useSignUpConsentsMutation';
import { getDeviceLocale } from '../services/device-locale';

/** 선택지 노출 순서 — 시장 하나당 하나(global-api.md 4.1). 시장이 늘면 여기에 는다 */
export const CONTENT_LANGUAGES: readonly ContentLanguage[] = ['ko', 'en'];

/**
 * A21 콘텐츠 언어 선택(auth-uiux.md 4.2-1). **기본 선택은 표시 언어(= 기기 언어)** 이고, 고른 값은 가입 요청의
 * `locale.preferred_language` 로 나간다. 시장 판정은 서버가 그 값으로 한다(global-api.md 2.1).
 *
 * [다음]으로 A4에 갈 때 **고른 언어로 앱의 표시 언어도 맞춘다**(PM 2026-10-19 — 가입 때 고른 언어로 화면·콘텐츠 언어를
 * 통일한다). 설정 "언어"와 같은 자리에 저장되어 다시 켜도 그 언어이고, 나중에 설정에서 따로 바꿀 수 있다. 토큰 만료로
 * 시작 화면에 돌아갈 때는 바꾸지 않는다(가입이 이어지지 않았다).
 *
 * [다음]은 **고른 언어로 동의 목록을 다시 받은 뒤** A4로 간다(PM 2026-10-16 — `POST /auth/sign-up/consents`). 로그인 응답의
 * `required_consents` 는 콘텐츠 언어를 모를 때 정해진 것이라, GLOBAL 의 국외 이전 동의(KAN-215) 같은 시장별 항목이 없다.
 * 항목을 넣고 빼는 판정은 서버가 하고 이 화면은 받은 목록을 넘기기만 한다.
 *
 * 실패 처리(폴백):
 * - `AUTH_SIGNUP_TOKEN_EXPIRED` — sign-up 의 같은 에러와 같다. 토스트 후 제공자 인증부터 다시(시작 화면).
 * - 재시도 가능(`retryable` — 네트워크·타임아웃·5xx·429) — 토스트 후 이 화면에 머문다. [다음]을 다시 누르면 재시도다
 *   (common-error-handling.md 4.3 사용자 액션). 목록 없이 넘기면 GLOBAL 필수 항목이 빠진 채 A4가 그려진다.
 * - 그 밖(구 서버 404 `NOT_FOUND` 포함 — 다시 보내도 결과가 같은 실패) — 로그인 응답의 목록으로 A4에 간다. 빠진 필수
 *   항목이 있으면 sign-up 이 `CONSENT_REQUIRED` 로 막으므로 동의 없이 계정이 생기지는 않는다(최종 판정은 서버).
 */
export const useContentLanguageScreen = (params: SignUpParams) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, 'ContentLanguage'>>();
  const showToast = useToastStore((s) => s.show);
  const consentsMutation = useSignUpConsentsMutation();
  const [selected, setSelected] = useState<ContentLanguage>(APP_LANGUAGE);

  const goToTermsConsent = (requiredConsents: RequiredConsent[], market: Market | null) => {
    // 응답을 기다리는 사이 뒤로 갔으면 A4를 띄우지 않는다
    if (!navigation.isFocused()) return;
    // 고른 언어로 화면 언어도 맞춘다(PM 2026-10-19) — A4부터 그 언어로 그린다. 같으면 아무것도 바뀌지 않는다.
    // 다시 부르지 않는다: 가입 토큰이 이 파라미터(메모리)에만 있다(locale.ts adoptSignupLanguage)
    adoptSignupLanguage(selected);
    navigation.navigate('TermsConsent', {
      signupToken: params.signupToken,
      requiredConsents,
      preferredLanguage: selected,
      // 서버 판정 시장이 있으면 넘긴다 — 글로벌 가입이 닫혀 있으면 English 도 KR 이 된다(global-api.md 2.1)
      ...(market !== null && { market }),
    });
  };

  const handleNext = async () => {
    if (consentsMutation.isPending) return;
    try {
      const { requiredConsents, market } = await consentsMutation.mutateAsync({
        signupToken: params.signupToken,
        locale: getDeviceLocale(selected),
      });
      goToTermsConsent(requiredConsents, market);
    } catch (error) {
      if (isApiError(error)) {
        if (error.errorCode === ERROR_CODES.AUTH_SIGNUP_TOKEN_EXPIRED) {
          showToast(AUTH_COPY.consent.signupExpired);
          navigation.popToTop();
          return;
        }
        if (error.retryable) {
          showToast(error.message);
          return;
        }
        logger.warn('[auth] sign-up consents refetch unavailable — using login list', {
          error_code: error.errorCode,
          http_status: error.httpStatus,
        });
      } else {
        logger.error('[auth] sign-up consents refetch failed', error);
      }
      goToTermsConsent(params.requiredConsents, null);
    }
  };

  return {
    selected,
    select: setSelected,
    handleNext,
    isLoading: consentsMutation.isPending,
    goBack: () => navigation.goBack(),
  };
};
