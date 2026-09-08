import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';

import { ReconsentScreen, SplashScreen, sessionService, useSessionStore } from '@/features/auth';
import { useShareLinkGate } from '@/features/share';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

/** 스플래시 최소 노출(splash.md 4-6) — 판정이 더 빨리 끝나도 이만큼은 유지한다 */
const SPLASH_MIN_MS = 800;

/**
 * 루트 분기 — 세션 상태로 스택을 조건 렌더링하므로 로그인·탈퇴·세션 만료 시
 * 스택이 통째로 교체된다(스택 초기화 규칙 — architecture.md 6.3).
 *
 * **실행 관문**(`splash.md` 4)의 2·3단계를 여기서 판정한다.
 * 저장된 토큰으로 세션을 복원한 뒤(2단계) 재동의 → 온보딩 순으로 가른다.
 * 버전 체크·점검 안내(1단계)는 아직 붙이지 않았다 — `GET /users/me/settings`가 따로 준다.
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

  /**
   * 최소 노출(4-6) — 판정이 순식간에 끝나도 스플래시를 이만큼 유지한다. mock 이나 캐시된
   * 응답이면 판정이 몇십 ms 에 끝나 화면이 번쩍인다.
   */
  const [isMinElapsed, setIsMinElapsed] = useState(false);
  const hasStartedRestore = useRef(false);

  useEffect(() => {
    // 앱 수명당 한 번만 — 세션 만료로 status 가 바뀌어도 다시 복원하지 않는다
    if (hasStartedRestore.current) return;
    hasStartedRestore.current = true;
    void sessionService.restoreSession();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  // 판정 전이거나 최소 노출 전이면 스플래시를 유지한다
  const isGatePending = status === 'restoring' || !isMinElapsed;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isGatePending ? (
        <RootStack.Screen name="Splash" component={SplashScreen} />
      ) : status !== 'authenticated' ? (
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
