import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import type { PolicyDocument } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import type { AuthStackParamList, SocialProvider } from '../auth.types';
import { useSocialLoginMutation } from './useSocialLoginMutation';
import { openPolicyDocument } from '../services/policy-document.service';
import { ProviderAuthCancelledError, authenticateWithProvider } from '../services/provider-auth.service';
import { sessionService } from '../services/session.service';

/**
 * 로그에 남길 식별 정보만 뽑는다. **예외 객체를 통째로 넘기지 않는다** —
 * axios 에러의 `config.data`에는 요청 본문이 그대로 들어 있어 `provider_token`이
 * 로그로 새어 나간다(convention.md 9장 — 토큰을 남기지 않는다).
 */
const describeAuthError = (error: unknown): Record<string, unknown> => {
  if (isApiError(error)) {
    // 서버가 준 값이라 원인 판정에 가장 유용하다. traceId로 서버 로그와 맞출 수 있다
    return {
      kind: 'server',
      error_code: error.errorCode,
      http_status: error.httpStatus,
      trace_id: error.traceId,
    };
  }
  if (error instanceof Error) {
    // 제공자 SDK는 네이티브 reject의 code를 그대로 올려준다(DEVELOPER_ERROR·KOE009 등)
    const code = (error as { code?: unknown }).code;
    return {
      kind: 'client',
      name: error.name,
      message: error.message,
      ...(typeof code === 'string' && { code }),
    };
  }
  return { kind: 'unknown' };
};

export const useStartScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Start'>>();
  const showToast = useToastStore((s) => s.show);
  const socialLoginMutation = useSocialLoginMutation();
  /** 제공자 인증 → 서버 검증 전 구간의 로딩 오버레이 표시(A2) */
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleProviderPress = async (provider: SocialProvider) => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      // 애플만 nonce가 함께 온다 — 인가 요청에 해시를 실은 원본이다(auth-api.md 4.1)
      const { providerToken, nonce } = await authenticateWithProvider(provider);
      const deviceId = await getDeviceId();
      const result = await socialLoginMutation.mutateAsync({
        provider,
        providerToken,
        deviceId,
        nonce,
      });

      if (result.status === 'consent_required') {
        navigation.navigate('TermsConsent', {
          signupToken: result.signupToken,
          requiredConsents: result.requiredConsents,
        });
        return;
      }

      // TODO(auth): pendingConsents가 있으면 재동의 화면으로 보낸다(auth-api.md 4.1 — /users/me/consents)
      await sessionService.startSession(result.tokens, result.user);
      // 이후 화면 전환은 RootNavigator가 세션 상태로 분기한다(온보딩/라이브러리 — auth.md 4.1)
    } catch (error) {
      // 취소는 실패가 아니다 — 에러 표시 없이 시작 화면으로 조용히 복귀한다(auth-uiux.md 4.2)
      if (error instanceof ProviderAuthCancelledError) return;
      // 사용자에게는 단일 문구만 보여주되(auth-uiux.md 4.2) 원인은 로그에 남긴다.
      // 제공자 SDK 실패·네트워크·서버 검증 실패가 화면상 구분되지 않아, 이 줄이 없으면
      // 릴리즈 빌드에서 원인을 알 방법이 없다(logger.error는 __DEV__ 가드가 없다)
      logger.error('[auth] social login failed', { provider, ...describeAuthError(error) });
      showToast(AUTH_COPY.loginFailed);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePolicyLinkPress = (link: PolicyDocument) => {
    // 약관 열람은 동의로 기록되지 않는다 — 인앱 브라우저로 본문만 연다(auth-uiux.md 4.1)
    void openPolicyDocument(link);
  };

  return {
    isAuthenticating,
    handleProviderPress,
    handlePolicyLinkPress,
  };
};
