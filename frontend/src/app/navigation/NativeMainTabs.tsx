import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { useState } from 'react';

import { theme } from '@/shared/theme';

import { useSessionStore } from '@/features/auth';
import { ExploreScreen } from '@/features/explore';
import { LibraryScreen } from '@/features/library';
import { MiniPlayer } from '@/features/player';
import { ProfileScreen } from '@/features/profile';

import { rememberTab, takePrimedTab, type RestorableTab } from './last-tab';
import type { MainTabParamList } from './types';

const NativeTab = createNativeBottomTabNavigator<MainTabParamList>();

/**
 * 하단 탭 — **iOS 26 시스템 탭 바**(`UITabBarController`, react-native-screens BottomTabs). JS 캡슐(CapsuleTabBar)
 * 대신 쓴다(HAS_NATIVE_TAB_BAR, 2026-09-24 PM "애플이 기본으로 제공하는 애니메이션 없나").
 *
 * - 리퀴드 글라스 탭 바·선택 알약의 부풀기·끌기·굴절·색수차·끝 넘김 고무줄이 **애플 코드 그대로**다. 흉내내지 않는다.
 *   iOS 26 에선 배경색·알약 색을 바꿀 공개 API 가 없다 — 시스템 값이 곧 design.md 0장("시스템 앱 같다")이다.
 * - **미니플레이어는 `bottomAccessory`** — Music 앱의 미니플레이어 자리. 탭 바 위에 얹히고 탭 바가 줄어들면
 *   인라인으로 합쳐진다. 유리·폭·모서리는 시스템이 준다(MiniPlayer placement="accessory").
 * - 아이콘은 SF Symbols — 캡슐의 SVG(TabBarIcon)와 같은 뜻의 기호를 고르고, 선택 시 채운(fill) 변형.
 * - 착지 규칙(온보딩 직후 탐색 > 마지막 탭 > 라이브러리)은 MainTabs 와 같다.
 *
 * 목록의 바닥 여백: 시스템이 탭 바·액세서리를 안전영역에 넣으므로 스크롤 뷰가 `contentInsetAdjustmentBehavior="automatic"`
 * 으로 비운다(DOCK_SCROLL_PROPS) — useBottomDockInset 은 간격만 준다.
 */
export default function NativeMainTabs() {
  const justCompletedOnboarding = useSessionStore((s) => s.justCompletedOnboarding);
  const [restoredTab] = useState(takePrimedTab);

  return (
    <NativeTab.Navigator
      initialRouteName={justCompletedOnboarding ? 'Explore' : (restoredTab ?? 'Library')}
      screenListeners={{
        state: (e) => {
          const s = e.data.state;
          const name = s?.routeNames?.[s.index ?? 0];
          if (name) rememberTab(name as RestorableTab);
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.primary,
        // 스크롤하면 탭 바가 줄어든다(TV·Music 앱) — 미니플레이어는 인라인으로 합쳐진다
        tabBarMinimizeBehavior: 'onScrollDown',
        // 미니플레이어 — 시스템이 두 배치(regular·inline)를 모두 렌더하고 하나만 보인다(공유 상태는 스토어)
        bottomAccessory: () => <MiniPlayer placement="accessory" />,
      }}
    >
      <NativeTab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarLabel: '라이브러리',
          tabBarIcon: ({ focused }) => ({
            type: 'sfSymbol',
            name: focused ? 'books.vertical.fill' : 'books.vertical',
          }),
        }}
      />
      <NativeTab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: '탐색',
          tabBarIcon: ({ focused }) => ({
            type: 'sfSymbol',
            name: focused ? 'safari.fill' : 'safari',
          }),
        }}
      />
      <NativeTab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: '프로필',
          tabBarIcon: ({ focused }) => ({
            type: 'sfSymbol',
            name: focused ? 'person.fill' : 'person',
          }),
        }}
      />
    </NativeTab.Navigator>
  );
}
