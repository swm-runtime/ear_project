import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
  ContentLanguageScreen,
  StartScreen,
  TermsConsentScreen,
  type AuthStackParamList,
} from '@/features/auth';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

/**
 * 시작 화면(A1) → 신규 가입자만 콘텐츠 언어 선택(A21) → 약관 동의(A4).
 * 계정은 A4 제출 시점에 생긴다 — 그 전 이탈은 계정 미생성이라 뒤로가기 허용
 */
export default function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Start" component={StartScreen} />
      <AuthStack.Screen name="ContentLanguage" component={ContentLanguageScreen} />
      <AuthStack.Screen name="TermsConsent" component={TermsConsentScreen} />
    </AuthStack.Navigator>
  );
}
