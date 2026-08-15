import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import TabBarIcon from '@/shared/ui/TabBarIcon';

import { EmailVerificationScreen } from '@/features/auth';
import { CareerInfoScreen } from '@/features/career';
import { ExploreScreen } from '@/features/explore';
import { InterestManagementScreen } from '@/features/interest';
import { LibraryScreen } from '@/features/library';
import { PlayerScreen } from '@/features/player';
import { ProfileScreen } from '@/features/profile';
import { SettingsScreen } from '@/features/settings';

import PlaceholderScreen from './PlaceholderScreen';
import type { MainStackParamList, MainTabParamList } from './types';

const MainTab = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

/** 탭바에서 안전영역을 뺀 순수 콘텐츠 높이(기본값 약 49) */
const TAB_BAR_CONTENT_HEIGHT = 60;

/** 탭 아이콘 크기. 네비게이터가 넘겨주는 기본값(약 24)보다 키운다 */
const TAB_ICON_SIZE = 28;

/** 하단 탭 3개 — 라이브러리가 기본 탭이다. 앱을 실행하면 항상 여기로 들어온다(library.md 2) */
function MainTabs() {
  // 높이를 직접 정하면 기본 안전영역 처리가 덮이므로 홈 인디케이터 높이를 직접 더한다.
  // 이걸 빼먹으면 인디케이터가 있는 기기에서 라벨이 인디케이터에 깔린다
  const insets = useSafeAreaInsets();

  return (
    <MainTab.Navigator
      initialRouteName="Library"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textSecondary,
        // 아이콘과 라벨을 함께 둔다 — 라벨을 빼면 어느 탭인지 아이콘 해석에만 기댄다
        tabBarLabelStyle: { fontSize: theme.font.size.xs, fontWeight: '600' },
        tabBarStyle: {
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          // 안전영역만 아래에 두고 위쪽 여백은 주지 않는다 — paddingTop을 주면
          // 아이콘·라벨이 그만큼 내려가 탭바 안에서 가운데가 아니게 된다
          paddingBottom: insets.bottom,
        },
        tabBarItemStyle: { justifyContent: 'center' },
      }}
    >
      <MainTab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: '라이브러리',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="library" color={color} focused={focused} size={TAB_ICON_SIZE} />
          ),
        }}
      />
      <MainTab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: '탐색',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="explore" color={color} focused={focused} size={TAB_ICON_SIZE} />
          ),
        }}
      />
      <MainTab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: '프로필',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="profile" color={color} focused={focused} size={TAB_ICON_SIZE} />
          ),
        }}
      />
    </MainTab.Navigator>
  );
}

/** Main 영역 — 탭과 그 위에 얹히는 화면(플레이어)을 하나의 스택으로 묶는다 */
export default function MainNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs" component={MainTabs} />
      {/* 플레이어 — 탭 위 풀스크린 모달(architecture.md 6.1). 앱바(셰브론·더보기)는 화면이
          직접 그리고, 뒤로가기·아래로 스와이프는 축소다(재생 유지 — player-uiux.md 4.8) */}
      <MainStack.Screen
        name="Player"
        component={PlayerScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      {/* 설정 — 앱바(뒤로 + "설정")를 화면이 직접 그린다(settings-uiux.md 4.1) */}
      <MainStack.Screen name="Settings" component={SettingsScreen} />
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
      {/* 설정 메뉴의 목적지 3종 — 공지(명세 추후)·탈퇴(auth A 계열)·관리자(admin.md) 플레이스홀더 */}
      <MainStack.Screen
        name="Notice"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '설정' }}
      />
      <MainStack.Screen
        name="Withdrawal"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '설정' }}
      />
      <MainStack.Screen
        name="Admin"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '설정' }}
      />
    </MainStack.Navigator>
  );
}
