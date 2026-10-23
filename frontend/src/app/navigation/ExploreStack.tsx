import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

import { ExploreScreen, SeriesScreen } from '@/features/explore';

import { TRANSPARENT_BAR } from './transparent-bar';
import type { ExploreStackParamList } from './types';

const Stack = createNativeStackNavigator<ExploreStackParamList>();

/**
 * 탐색 탭 안의 스택 — **시리즈 화면(E14)을 탭 안에서 연다**(PM 2026-10-22 "시리즈물 들어가면 왜 dock 하고 미니플레이어 안 나와").
 * 애플 뮤직 앨범처럼 탭 바(독)와 미니플레이어가 그대로 남는다. 탭 위(Main 스택)에 얹으면 둘 다 가려졌다.
 *
 * **바(큰 제목 줄)는 이 스택이 든다** — iOS 26 갈래에서 탭 쪽 바를 끄고 홈 화면에 투명 시스템 바를 건다. 2026-09-28 에 스택을
 * 걷어낸 이유(탭의 바가 스택 한 겹 너머의 피드 목록을 못 붙잡아 큰 제목이 안 접힘 — b020d5f6)는 바와 목록 사이의 그 한 겹이었다.
 * 바를 스택 화면이 들면 바 → 목록이 라이브러리 탭과 같은 한 겹이 된다(iOS 26 실기기로 접힘 확인 대상). 시리즈 화면은 시스템 바 없이 자기 앱바를 그린다(제목은 본문 — 접지 않는다)
 */
export default function ExploreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="ExploreHome"
        component={ExploreScreen}
        options={HAS_NATIVE_TAB_BAR ? TRANSPARENT_BAR : undefined}
      />
      {/*
        시리즈 화면은 아래쪽 스크롤 가장자리 효과를 끈다(iOS 26 — 시스템 탭 바·미니플레이어 위 내용을 흐리고 어둡게 하는 띠).
        하단 '다른 항목' 구역이 단색이라 그 어둡게 하는 부분만 따로 띠로 떴다(PM 2026-10-22 18:40 "이상한 띠만 없애봐")
      */}
      <Stack.Screen
        name="Series"
        component={SeriesScreen}
        options={{ scrollEdgeEffects: { bottom: 'hidden' } }}
      />
    </Stack.Navigator>
  );
}
