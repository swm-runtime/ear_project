import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useSessionStore } from '@/features/auth';
import { useShareLinkGate } from '@/features/share';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * 루트 분기 — 세션 상태로 스택을 조건 렌더링하므로 로그인·탈퇴·세션 만료 시
 * 스택이 통째로 교체된다(스택 초기화 규칙 — architecture.md 6.3).
 * TODO: SplashGate(버전 체크 → 인증 → 온보딩 판정) 구현 시 이 분기 앞에 둔다(splash.md).
 */
export default function RootNavigator() {
  const status = useSessionStore((s) => s.status);
  const isOnboardingCompleted = useSessionStore((s) => s.user?.onboardingCompleted ?? false);

  // 공유 링크 수신(share.md 4.3, P1) — 관문 통과 사용자만 상세로, 아니면 목적지 폐기
  useShareLinkGate();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {status !== 'authenticated' ? (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      ) : isOnboardingCompleted ? (
        <RootStack.Screen name="Main" component={MainNavigator} />
      ) : (
        <RootStack.Screen name="Onboarding" component={OnboardingNavigator} />
      )}
    </RootStack.Navigator>
  );
}
