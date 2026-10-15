import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { APP_LANGUAGE } from '@/shared/i18n/locale';

import type { AuthStackParamList, ContentLanguage, SignUpParams } from '../auth.types';

/** 선택지 노출 순서 — 시장 하나당 하나(global-api.md 4.1). 시장이 늘면 여기에 는다 */
export const CONTENT_LANGUAGES: readonly ContentLanguage[] = ['ko', 'en'];

/**
 * A21 콘텐츠 언어 선택(auth-uiux.md 4.2-1). **기본 선택은 표시 언어(= 기기 언어)** 이고, 고른 값은
 * 다음 화면(A4)으로 넘겨 가입 요청의 `locale.preferred_language` 로 보낸다 — 이 화면은 서버를 부르지 않는다.
 * 시장 판정은 서버가 그 값으로 한다(global-api.md 2.1).
 */
export const useContentLanguageScreen = (params: SignUpParams) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, 'ContentLanguage'>>();
  const [selected, setSelected] = useState<ContentLanguage>(APP_LANGUAGE);

  const handleNext = () => {
    navigation.navigate('TermsConsent', { ...params, preferredLanguage: selected });
  };

  return {
    selected,
    select: setSelected,
    handleNext,
    goBack: () => navigation.goBack(),
  };
};
