import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ExploreScreen, ExploreSearchScreen } from '@/features/explore';

import type { ExploreStackParamList } from './types';

const Stack = createNativeStackNavigator<ExploreStackParamList>();

/**
 * 탐색 탭 안의 스택(iOS 26 시스템 탭 바 갈래) — 검색 화면(E6·E7)을 **탭 안에서** 푸시한다.
 * 종전엔 검색이 탭 위(Main 스택)에 얹혀 시스템 탭 바·액세서리(미니플레이어)가 가려졌고, 그 자리를 옛 JS 미니플레이어가
 * 대신 그려 튀었다(PM 2026-09-27 02:07 "검색에 미니플레이어는 또 왜 보여"). 애플 뮤직처럼 검색 중에도 탭 바와
 * 액세서리가 그대로 남는다. JS 탭 바 갈래는 종전대로 Main 스택의 ExploreSearch 를 쓴다.
 * 화면 이름은 탭(`Explore`)과 겹치지 않게 `ExploreHome` — 분석의 화면 이름은 `focusedRouteName` 이 `Explore` 로 되돌린다.
 */
export default function ExploreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExploreHome" component={ExploreScreen} />
      {/* 검색창 탭 → 같은 자리의 입력 상태 전환이라 화면 전환 애니메이션을 끈다(Main 스택의 ExploreSearch 와 같다) */}
      <Stack.Screen
        name="ExploreSearch"
        component={ExploreSearchScreen}
        options={{ animation: 'none' }}
      />
    </Stack.Navigator>
  );
}
