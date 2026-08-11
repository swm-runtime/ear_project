import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { theme } from '@/shared/theme';

import { ExploreScreen } from '@/features/explore';
import { LibraryScreen } from '@/features/library';
import { PlayerScreen } from '@/features/player';
import { ProfileScreen } from '@/features/profile';
import { SettingsScreen } from '@/features/settings';

import PlaceholderScreen from './PlaceholderScreen';
import type { MainStackParamList, MainTabParamList } from './types';

const MainTab = createBottomTabNavigator<MainTabParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

/** 하단 탭 3개 — 라이브러리가 기본 탭이다. 앱을 실행하면 항상 여기로 들어온다(library.md 2) */
function MainTabs() {
  return (
    <MainTab.Navigator
      initialRouteName="Library"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textSecondary,
        // 아이콘 리소스 도입 전 라벨만으로 구성한다
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: theme.font.size.sm, fontWeight: '600' },
        tabBarItemStyle: { justifyContent: 'center' },
      }}
    >
      <MainTab.Screen
        name="Library"
        component={LibraryScreen}
        options={{ tabBarLabel: '라이브러리' }}
      />
      <MainTab.Screen name="Explore" component={ExploreScreen} options={{ tabBarLabel: '탐색' }} />
      <MainTab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: '프로필' }}
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
      <MainStack.Screen
        name="EmailVerification"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '프로필' }}
      />
      <MainStack.Screen
        name="InterestManagement"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '프로필' }}
      />
      <MainStack.Screen
        name="Career"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '프로필' }}
      />
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
