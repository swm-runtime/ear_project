import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { theme } from '@/shared/theme';

import { ExploreScreen } from '@/features/explore';
import { LibraryScreen } from '@/features/library';
import { ProfileScreen } from '@/features/profile';

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
      {/* TODO: player feature 구현 시 교체(player.md) — 전체 화면 모달 전환도 그때 정한다.
          플레이스홀더 동안은 기본 push + 헤더를 둔다: 화면 안에 돌아갈 수단이 있어야 한다 */}
      <MainStack.Screen
        name="Player"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '라이브러리' }}
      />
      {/* TODO: 프로필 카드 목적지 5종 — 각 화면 구현 시 컴포넌트만 교체한다(라우트 이름 유지).
          플레이스홀더 동안은 기본 push + 헤더를 둔다: 화면 안에 돌아갈 수단이 있어야 한다 */}
      <MainStack.Screen
        name="Settings"
        component={PlaceholderScreen}
        options={{ headerShown: true, headerTitle: '', headerBackTitle: '프로필' }}
      />
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
    </MainStack.Navigator>
  );
}
