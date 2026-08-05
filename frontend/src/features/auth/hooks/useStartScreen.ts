import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { getDeviceId } from '@/shared/lib/device-id';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { AUTH_COPY } from '../auth.copy';
import type { AuthStackParamList, SocialProvider } from '../auth.types';
import { useSocialLoginMutation } from './useSocialLoginMutation';
import { ProviderAuthCancelledError, authenticateWithProvider } from '../services/provider-auth.service';
import { sessionService } from '../services/session.service';

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
      const providerToken = await authenticateWithProvider(provider);
      const deviceId = await getDeviceId();
      const result = await socialLoginMutation.mutateAsync({ provider, providerToken, deviceId });

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
      showToast(AUTH_COPY.loginFailed);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePolicyLinkPress = (link: 'terms' | 'privacy') => {
    // 약관 열람은 동의로 기록되지 않는다 — 인앱 브라우저로 본문만 연다(auth-uiux.md 4.1)
    // TODO(auth): 약관 문서 URL 확정 후 expo-web-browser로 연다
    logger.warn('[auth] policy document url not decided yet:', link);
  };

  return {
    isAuthenticating,
    handleProviderPress,
    handlePolicyLinkPress,
  };
};
