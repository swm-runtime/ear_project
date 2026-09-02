import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { StartScreen, TermsConsentScreen, type AuthStackParamList } from '@/features/auth';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

/** 시작 화면(A1) → 약관 동의(A4). 동의 화면 이탈 시 계정 미생성 — 뒤로가기 허용 */
export default function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Start" component={StartScreen} />
      <AuthStack.Screen name="TermsConsent" component={TermsConsentScreen} />
    </AuthStack.Navigator>
  );
}
