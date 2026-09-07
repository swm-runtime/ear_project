import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ReconsentScreen, useSessionStore } from '@/features/auth';
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
  /**
   * 재동의 판정은 **온보딩 판정보다 앞이다**(splash.md 4 — 3단계). 약관에 동의하지 않은
   * 사용자를 온보딩으로 들여보내면 관심사·커리어를 다 받은 뒤에야 동의를 묻게 된다.
   */
  const hasPendingConsents = useSessionStore((s) => s.pendingConsents.length > 0);

  // 공유 링크 수신(share.md 4.3, P1) — 관문 통과 사용자만 상세로, 아니면 목적지 폐기
  useShareLinkGate();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {status !== 'authenticated' ? (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      ) : hasPendingConsents ? (
        <RootStack.Screen name="Reconsent" component={ReconsentScreen} />
      ) : isOnboardingCompleted ? (
        <RootStack.Screen name="Main" component={MainNavigator} />
      ) : (
        <RootStack.Screen name="Onboarding" component={OnboardingNavigator} />
      )}
    </RootStack.Navigator>
  );
}
