import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState } from 'react';

import { PUSHED_SCREEN_HEADER } from '@/shared/navigation/pushed-screen-header';
import { USE_NATIVE_PLAYER_ZOOM } from '@/shared/navigation/zoom-transition';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

import { EmailVerificationScreen, useSessionStore, WithdrawalScreen } from '@/features/auth';
import { CareerInfoScreen } from '@/features/career';
import { ContentDetailScreen } from '@/features/content-detail';
import { ExploreScreen, ExploreSearchScreen } from '@/features/explore';
import { InterestManagementScreen } from '@/features/interest';
import { LibraryScreen } from '@/features/library';
import { NoticeDetailScreen, NoticeListScreen } from '@/features/notice';
import {
  NotificationPrePromptModal,
  PushArrivalBanner,
  usePrePromptGate,
  usePushLinkGate,
  useNotificationStore,
} from '@/features/notification';
import { FirstRunTutorial } from '@/features/onboarding';
import { PlayConfirmDialog, PlayerScreen } from '@/features/player';
import { ProfileScreen } from '@/features/profile';
import { SettingsScreen } from '@/features/settings';

import CapsuleTabBar from './CapsuleTabBar';
import { rememberTab, takePrimedTab, type RestorableTab } from './last-tab';
import NativeMainTabs from './NativeMainTabs';
import PlaceholderScreen from './PlaceholderScreen';
import type { MainStackParamList, MainTabParamList } from './types';

const MainTab = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

/**
 * 하단 탭 3개 — 앱을 실행하면 라이브러리로 들어온다(library.md 2).
 * **온보딩을 막 끝낸 진입만 탐색으로 착지한다**(2026-09-02) — 갓 만든 라이브러리보다
 * 고를 것이 많은 화면을 먼저 보여준다. `initialRouteName`은 첫 마운트에만 읽히는데,
 * 온보딩 → Main 전환에서 이 내비게이터가 새로 마운트되므로 그 시점 값이 그대로 쓰인다.
 *
 * **그 둘 다 아니면 마지막으로 본 탭으로 착지한다**(splash.md 4장 4-1 — 2026-09-15).
 * 우선순위는 온보딩 직후 > 마지막 탭 > 라이브러리다 — 온보딩을 막 끝낸 사람에게는
 * 이전 기록보다 "고를 것이 많은 화면"이 먼저다.
 */
function MainTabs() {
  const justCompletedOnboarding = useSessionStore((s) => s.justCompletedOnboarding);
  // 마운트 시 한 번만 꺼낸다 — 리렌더마다 부르면 두 번째부터 null 이라 탭이 흔들린다
  const [restoredTab] = useState(takePrimedTab);

  return (
    <MainTab.Navigator
      initialRouteName={justCompletedOnboarding ? 'Explore' : (restoredTab ?? 'Library')}
      screenListeners={{
        // 탭을 떠난 시각이 아니라 도착한 시각을 적는다 — 마지막으로 머문 탭이 곧
        // 마지막으로 본 탭이고, 떠나는 시점을 잡으려면 이탈 경로마다 훅이 필요하다
        state: (e) => {
          const s = e.data.state;
          const name = s?.routeNames?.[s.index ?? 0];
          if (name) rememberTab(name as RestorableTab);
        },
      }}
      // 탭 바는 떠 있는 유리 캡슐(CapsuleTabBar, 2026-09-23 PM) — 기본 탭 바의 스타일 옵션은 쓰지 않는다.
      // 라벨(tabBarLabel)만 각 화면 옵션에서 읽는다
      tabBar={(props) => <CapsuleTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <MainTab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: '라이브러리',
        }}
      />
      <MainTab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: '탐색',
        }}
      />
      <MainTab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: '프로필',
        }}
      />
    </MainTab.Navigator>
  );
}

/** Main 영역 — 탭과 그 위에 얹히는 화면(플레이어)을 하나의 스택으로 묶는다 */
export default function MainNavigator() {
  const clearPrePromptPending = useNotificationStore((s) => s.clearPrePromptPending);
  // 코치마크가 끝난 뒤에야 열린다 — 동시에 뜨면 모달이 코치마크를 덮는다(usePrePromptGate)
  const isPrePromptVisible = usePrePromptGate();
  // 탭된 알림의 목적지로 보낸다 — Main 이 떴다는 것이 관문 통과다(notification.md 4.4)
  const pushGate = usePushLinkGate();

  return (
    <>
      <MainStack.Navigator screenOptions={{ headerShown: false }}>
        {/* iOS 26 은 시스템 탭 바(NativeMainTabs) — 알약 애니메이션·미니플레이어 액세서리를 애플이 그린다.
          그 밑·Android 는 JS 캡슐(MainTabs + CapsuleTabBar) */}
        <MainStack.Screen name="Tabs" component={HAS_NATIVE_TAB_BAR ? NativeMainTabs : MainTabs} />
        {/* 플레이어 — 탭 위 모달(architecture.md 6.1). 앱바(셰브론·더보기)는 화면이 직접 그리고,
          뒤로가기·아래로 스와이프는 축소다(재생 유지 — player-uiux.md 4.8).
          투명 모달 + 전환 없음(2026-09-16): 열림·닫힘은 화면이 직접 그린다 — 라이브러리의 미니플레이어
          자리에서 아트워크·제목이 커져 올라오고, 닫을 때 그 자리로 되돌아가 붙는다 */}
        <MainStack.Screen
          name="Player"
          component={PlayerScreen}
          options={
            // iOS 26 + 줌 모듈 빌드: 풀스크린 모달을 시스템이 띄운다 — 미니플레이어에서 등록된 소스 뷰가 있으면 iOS 18 줌 전환
            // (카드가 부풀어 오르고, 닫으면 그 자리로 줄어든다 — 애플 뮤직, PM 2026-09-26 03:55), 없으면 기본 슬라이드.
            // 그 외: 투명 모달 + 전환 없음, 열림·닫힘은 화면이 직접 그린다
            USE_NATIVE_PLAYER_ZOOM
              ? { presentation: 'fullScreenModal' }
              : { presentation: 'transparentModal', animation: 'none' }
          }
        />
        {/* 콘텐츠 상세 — 앱바(뒤로 + 타이틀)를 화면이 직접 그린다(content-detail-uiux.md 4.1).
          플레이어(모달) 위에도 쌓일 수 있다 — 진입해도 재생은 유지된다(content-detail.md 2장) */}
        <MainStack.Screen name="ContentDetail" component={ContentDetailScreen} />
        {/* 검색(E6·E7) — 검색창 줄을 화면이 직접 그린다. 탭 위 push라 피드 상태는 스택 아래에
          그대로 남고, 뒤로가기·[취소]의 pop이 곧 검색 상태 폐기다(explore.md 4.5-1).
          검색창 탭 → 같은 자리의 입력 상태 전환이라 화면 전환 애니메이션을 끈다 */}
        <MainStack.Screen
          name="ExploreSearch"
          component={ExploreSearchScreen}
          options={{ animation: 'none' }}
        />
        {/* 설정 — 앱바(뒤로 + "설정")를 화면이 직접 그린다(settings-uiux.md 4.1) */}
        {/* 설정 — iOS 26: 시스템 투명 바(뒤로만) + 콘텐츠 큰 제목(PUSHED_SCREEN_HEADER). 그 외: 화면이 앱바를 그린다 */}
        <MainStack.Screen name="Settings" component={SettingsScreen} options={PUSHED_SCREEN_HEADER} />
        {/* TODO: 프로필·설정 목적지 — 각 화면 구현 시 컴포넌트만 교체한다(라우트 이름 유지).
          플레이스홀더 동안은 기본 push + 헤더를 둔다: 화면 안에 돌아갈 수단이 있어야 한다 */}
        <MainStack.Screen
          name="Subscription"
          component={PlaceholderScreen}
          options={{ headerShown: true, headerTitle: '', headerBackTitle: '프로필' }}
        />
        {/* 이메일 인증 — 앱바(뒤로 + 타이틀)를 화면이 직접 그린다(auth-uiux.md 4.7~4.10).
          설정·프로필 두 경로가 같은 화면이다(auth.md 4.5 — 발송 제한이 경로에 합산 적용) */}
        <MainStack.Screen name="EmailVerification" component={EmailVerificationScreen} />
        {/* 관심사 관리 — 앱바(뒤로 + "관심 주제 관리")를 화면이 직접 그린다(interest-management-uiux.md 4.1).
          변경 있음 상태의 이탈(뒤로가기·스와이프)은 화면이 beforeRemove로 가로챈다(IM7) */}
        <MainStack.Screen name="InterestManagement" component={InterestManagementScreen} />
        {/* 커리어 정보 — 앱바(뒤로 + "커리어 정보" + [초기화])를 화면이 직접 그린다(career-uiux.md 4.1).
          변경 있음 상태의 이탈(뒤로가기·스와이프)은 화면이 beforeRemove로 가로챈다(CR5) */}
        <MainStack.Screen name="Career" component={CareerInfoScreen} />
        {/* 공지 목록·상세 — 앱바(뒤로 + "공지사항" / 뒤로만)를 화면이 직접 그린다(settings-uiux.md 4.7 S8·S9).
          settings → notice 의존 없이 라우트 이름으로만 이동한다(content-detail과 같은 방식) */}
        <MainStack.Screen name="Notice" component={NoticeListScreen} />
        <MainStack.Screen name="NoticeDetail" component={NoticeDetailScreen} />
        {/* 회원 탈퇴(A7·A8) — 앱바(뒤로 + "회원 탈퇴")를 화면이 직접 그린다(auth-uiux.md 4.5).
          처리 중 이탈 차단(뒤로가기·스와이프)은 화면이 beforeRemove·gestureEnabled로 소유한다 */}
        <MainStack.Screen name="Withdrawal" component={WithdrawalScreen} />
        <MainStack.Screen
          name="Admin"
          component={PlaceholderScreen}
          options={{ headerShown: true, headerTitle: '', headerBackTitle: '설정' }}
        />
      </MainStack.Navigator>

      {/*
        온보딩 직후 한 번 뜨는 알림 사전 안내(2026-09-02 — 온보딩 마지막 화면이던 O10을 옮겼다).
        착지 탭이 라이브러리일 수도 탐색일 수도 있어 **탭이 아니라 여기서** 그린다 —
        화면마다 두면 어느 탭으로 들어왔느냐에 따라 떴다 안 떴다 한다.
        여는 시점은 코치마크가 끝난 뒤다(2026-09-04) — 권한은 가치를 보여준 다음에 묻는다
      */}
      {/* 첫 사용 튜토리얼 — 예시 화면으로 흐름을 보여준다. 알림 안내보다 먼저다 */}
      <FirstRunTutorial />

      <NotificationPrePromptModal
        isVisible={isPrePromptVisible}
        syncOnDismiss
        onFinished={clearPrePromptPending}
      />

      {/* 푸시 딥링크 재생의 확인 팝업 — 딥링크도 팝업 규칙의 예외가 아니다(paywall.md 4.2) */}
      <PlayConfirmDialog
        visible={pushGate.confirmState !== null}
        remaining={pushGate.confirmState?.remaining ?? 0}
        onConfirm={pushGate.confirmPlay}
        onCancel={pushGate.cancelConfirm}
        onSuppressToday={pushGate.suppressAndPlay}
      />

      {/* 포그라운드 수신 — OS 배너 대신 그린다(notification.md 4.5). 어느 화면 위에도 얹힌다 */}
      <PushArrivalBanner />
    </>
  );
}
