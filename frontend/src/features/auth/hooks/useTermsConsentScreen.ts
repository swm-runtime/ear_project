import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { getDeviceId } from '@/shared/lib/device-id';
import { useToastStore } from '@/shared/ui/toast.store';

import { CONTENT_LANGUAGE_MARKET } from '../auth.constants';
import { AUTH_COPY, ageConfirmationLabel } from '../auth.copy';
import type { AuthStackParamList, ConsentType, RequiredConsent } from '../auth.types';
import { useSignUpMutation } from './useSignUpMutation';
import { getDeviceLocale } from '../services/device-locale';
import { openPolicyDocument } from '../services/policy-document.service';
import { sessionService } from '../services/session.service';

type TermsConsentParams = AuthStackParamList['TermsConsent'];

export const useTermsConsentScreen = ({
  signupToken,
  requiredConsents,
  preferredLanguage,
}: TermsConsentParams) => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'TermsConsent'>>();
  const showToast = useToastStore((s) => s.show);
  const signUpMutation = useSignUpMutation();
  /** 동의 체크 상태 — 필수·선택 모두 기본값 해제(auth-uiux.md 4.3) */
  const [checkedMap, setCheckedMap] = useState<Partial<Record<ConsentType, boolean>>>({});

  /**
   * 연령 확인 — **서버가 받는 정식 동의다**(consents.age_confirmation, PR #142).
   * 개인정보보호법 제22조의2 는 만 14세 미만 아동의 개인정보를 처리하려면 법정대리인
   * 동의를 받으라고 한다. 그 절차를 두지 않으므로 가입 시점에 스스로 밝히게 해서 수집
   * 자체를 막는다. **기준 연령은 시장별이다**(global-api.md 2.1 — KR 18 · GLOBAL 16, KAN-206).
   * KR 18은 Play 대상 연령대 선언과 어긋나지 않기 위해서고, GLOBAL 16은 어느 공개 국가에서도
   * 법정대리인 동의 없이 본인이 동의할 수 있는 연령이다.
   *
   * 계정이 아직 없어 `user.market` 이 없다 — 시장은 A21에서 고른 콘텐츠 언어가 가리키는 값으로
   * 미리 그린다(`ko` → `kr`, `en` → `global`). 판정 자체는 가입 요청을 받은 서버가 같은 값으로 한다.
   *
   * 서버 목록(`requiredConsents`)에 이미 있으면 그것을 쓰고, 아직 내려주지 않는 서버를
   * 만나면 여기서 채운다 — 빠뜨리면 서버가 CONSENT_REQUIRED 로 가입을 막는다.
   */
  const serverAgeRow = requiredConsents.find((c) => c.consentType === 'age_confirmation');
  const ageConsent: RequiredConsent = serverAgeRow ?? {
    consentType: 'age_confirmation',
    version: null,
    isRequired: true,
  };

  const market = CONTENT_LANGUAGE_MARKET[preferredLanguage];

  const items = [
    {
      ...ageConsent,
      label: ageConfirmationLabel(market),
      description: null,
      isChecked: checkedMap.age_confirmation ?? false,
    },
    ...requiredConsents
      .filter((consent) => consent.consentType !== 'age_confirmation')
      .map((consent) => ({
        ...consent,
        label: AUTH_COPY.consent.label[consent.consentType],
        description:
          consent.consentType === 'marketing' ? AUTH_COPY.consent.marketingDescription : null,
        isChecked: checkedMap[consent.consentType] ?? false,
      })),
  ];

  const isAllChecked = items.every((item) => item.isChecked);
  /** 필수 전체 체크 시에만 [동의하고 시작하기] 활성(auth.md 4.1) */
  const canSubmit = items.filter((item) => item.isRequired).every((item) => item.isChecked);

  const toggleConsent = (consentType: ConsentType) => {
    setCheckedMap((prev) => ({ ...prev, [consentType]: !(prev[consentType] ?? false) }));
  };

  const toggleAll = () => {
    const next = !isAllChecked;
    setCheckedMap({
      age_confirmation: next,
      ...Object.fromEntries(requiredConsents.map((consent) => [consent.consentType, next])),
    });
  };

  /** [보기] — 랜딩에 게시된 본문을 인앱 브라우저로 연다. **열람은 동의가 아니다**(auth-uiux.md 4.3) */
  const handleViewPress = (consentType: ConsentType) => {
    // 마케팅·연령 확인은 열람 문서가 없어 화면이 [보기]를 그리지 않는다 — 방어적으로 한 번 더 막는다
    if (consentType !== 'terms' && consentType !== 'privacy') return;
    void openPolicyDocument(consentType);
  };

  const handleSubmit = async () => {
    if (!canSubmit || signUpMutation.isPending) return;
    try {
      const deviceId = await getDeviceId();
      const session = await signUpMutation.mutateAsync({
        signupToken,
        deviceId,
        // 화면이 그린 행 그대로 보낸다 — 연령 확인이 빠지면 서버가 CONSENT_REQUIRED 로 막는다.
        // version 은 서버가 준 값 그대로다(`terms_global_v1` 같은 시장 네임스페이스 포함 — 클라이언트 상수 금지)
        consents: items.map((item) => ({
          consentType: item.consentType,
          version: item.version,
          isAgreed: item.isChecked,
        })),
        // A21에서 고른 콘텐츠 언어 — 서버가 이 값으로 시장을 정한다(global-api.md 2.1)
        locale: getDeviceLocale(preferredLanguage),
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
