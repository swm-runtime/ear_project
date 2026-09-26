import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';

import { ForceUpdateScreen, checkAppVersionGate, useAppUpdateStore } from '@/features/app-update';
import {
  ReconsentScreen,
  SplashScreen,
  sessionService,
  useSessionStore,
  useSplashStore,
} from '@/features/auth';
import { useShareLinkGate } from '@/features/share';

import AuthNavigator from './AuthNavigator';
import { primeTabToRestore } from './last-tab';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * 루트 분기 — 세션 상태로 스택을 조건 렌더링하므로 로그인·탈퇴·세션 만료 시
 * 스택이 통째로 교체된다(스택 초기화 규칙 — architecture.md 6.3).
 *
 * **실행 관문**(`splash.md` 4)의 1·2·3단계를 여기서 판정한다.
 * 버전 관문(1단계 — `GET /app/version`, KAN-99)이 먼저다: 426 이면 강제 업데이트 화면만 그리고 **이후 로직을
 * 시작하지 않는다**(세션 복원도 그 뒤에 건다). 통과·판정 불가(fail-open)면 저장된 토큰으로 세션을 복원한 뒤(2단계)
 * 재동의 → 온보딩 순으로 가른다. 점검 안내(notice)는 계약이 없어 아직 없다.
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
   * 최소 노출(4-6) — 판정이 순식간에 끝나도 로고 모션이 끝날 때까지 스플래시를 유지한다. mock 이나
   * 캐시된 응답이면 판정이 몇십 ms 에 끝나 화면이 번쩍인다. 끝난 시점은 SplashScreen 이 영상의
   * 재생 위치로 판정해 올린다(모션 축소 설정이면 0.8초, 영상이 못 뜨면 최대 6초 안전장치).
   */
  const isMotionDone = useSplashStore((s) => s.isMotionDone);
  /**
   * 마지막 탭을 다 읽었는가(splash.md 4장 4-1). **이걸 기다리지 않으면 탭이 라이브러리로
   * 먼저 마운트되고, 마운트 직후 기록이 저장값을 덮어써 다음 실행도 계속 실패한다.**
   * 읽기가 실패해도 true 로 둔다 — 복원은 편의지 관문을 막을 이유가 아니다.
   */
  const [isTabPrimed, setIsTabPrimed] = useState(false);
  const hasStartedRestore = useRef(false);
  /** 버전 관문(1단계) — `pending` 이면 스플래시, `required` 면 강제 업데이트 화면 하나만 */
  const versionGate = useAppUpdateStore((s) => s.gate);

  useEffect(() => {
    // 앱 수명당 한 번만 — 세션 만료로 status 가 바뀌어도 다시 복원하지 않는다
    if (hasStartedRestore.current) return;
    hasStartedRestore.current = true;
    // 1단계 버전 관문이 끝난 뒤에 2단계(세션 복원)를 건다 — 426 이면 뒤 단계를 실행하지 않는다(splash.md 4 "앞 단계에서
    // 걸리면 뒤 단계는 실행하지 않는다"). 관문은 3초 타임아웃·fail-open 이라 세션 복원이 이만큼 늦어도 로고 모션 안이다.
    // 마지막 탭 읽기는 판정이 아니라 나란히 읽는다(4-1) — 관문이 **이 완료를 기다려야** 탭 내비게이터가 initialRouteName 을
    // 동기로 읽을 수 있다
    void checkAppVersionGate().then(() => {
      if (useAppUpdateStore.getState().gate === 'required') return;
      void sessionService.restoreSession();
    });
    void primeTabToRestore().finally(() => setIsTabPrimed(true));
  }, []);

  // 판정 전이거나·로고 모션 전이거나·마지막 탭을 아직 못 읽었으면 스플래시를 유지한다
  const isGatePending =
    versionGate === 'pending' || status === 'restoring' || !isMotionDone || !isTabPrimed;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {versionGate === 'required' ? (
        // 닫기 불가 — 스택에 이 화면뿐이라 나갈 곳이 없다. 30분 복귀 재검사에서 걸려도 여기로 온다(splash.md 2장)
        <RootStack.Screen
          name="ForceUpdate"
          component={ForceUpdateScreen}
          options={{ gestureEnabled: false }}
        />
      ) : isGatePending ? (
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
