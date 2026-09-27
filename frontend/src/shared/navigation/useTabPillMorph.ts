import {
  useFocusEffect,
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { Animated } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

/** 알약이 있는 탭 — 이 둘 사이를 오갈 때만 모핑한다 */
const PILL_TABS = new Set(['Library', 'Explore']);

/** 이 화면을 품은 탭 내비게이터의 navigation — 탐색은 탭 안 스택이라 부모를 타고 올라간다 */
const findTabNavigation = (
  navigation: NavigationProp<ParamListBase>,
): NavigationProp<ParamListBase> | undefined => {
  let current: NavigationProp<ParamListBase> | undefined = navigation;
  while (current) {
    if (current.getState()?.type === 'tab') return current;
    current = current.getParent();
  }
  return undefined;
};

/**
 * 탭을 오갈 때 제목 줄 오른쪽 알약이 **모양을 이어받아 변한다**(PM 2026-09-28 00:32). 라이브러리 알약은 [링 | 필터],
 * 탐색 알약은 [링]. 여분 칸(필터 칸) 폭 0 ↔ 44 를 포커스 때 이 탭의 값으로 스프링한다.
 *
 * **시작값은 떠날 때 미리 맞춘다**(00:42 "갑자기 튕긴다") — 네이티브 탭은 화면이 먼저 바뀌고 이벤트가 뒤에 와서, 포커스
 * 때 시작값을 넣으면 첫 프레임이 제 모양으로 그려졌다가 튄다. 그래서 blur 시점(이 화면이 이미 안 보일 때) 다음 탭이
 * 알약 탭이면 그 탭의 모양으로 바꿔 두고, 돌아오면 거기서 제 모양으로 자란다/줄어든다. 알약 없는 탭(프로필)으로 가면
 * 제 모양 그대로 둔다. 폭은 레이아웃이라 JS 드라이버 — 짧은 스프링 한 번
 */
export const useTabPillMorph = (hasExtraCell: boolean): Animated.AnimatedInterpolation<number> => {
  const own = hasExtraCell ? 1 : 0;
  const progress = useAnimatedValue(own);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  useEffect(() => {
    const tabNavigation = findTabNavigation(navigation);
    if (!tabNavigation) return undefined;
    return tabNavigation.addListener('blur', () => {
      const state = tabNavigation.getState();
      const next = state?.routes[state.index]?.name;
      // 다음 탭이 다른 알약 탭이면 그쪽 모양(여분 칸 반대)으로 — 돌아올 때의 출발점이 된다
      if (next && PILL_TABS.has(next)) progress.setValue(1 - own);
    });
  }, [navigation, progress, own]);

  useFocusEffect(
    useCallback(() => {
      Animated.spring(progress, {
        toValue: own,
        ...motion.spring.snappy,
        overshootClamping: true,
        useNativeDriver: false,
      }).start();
    }, [own, progress]),
  );
  return progress.interpolate({ inputRange: [0, 1], outputRange: [0, TAB_PILL_CELL] });
};

/** 알약 한 칸 폭 — 터치 최소 폭(44) */
export const TAB_PILL_CELL = theme.touchTarget.minWidth;

/**
 * 알약이 앉는 **바깥 자리의 고정 폭**(두 칸) — 알약은 이 안에서 오른쪽에 붙어 폭만 변한다.
 *
 * 알약은 2026-09-28 02:53(#902) 부터 **시스템 내비게이션 바의 바 버튼**이다(`useSystemLargeTitle` →
 * `unstable_headerRightItems`). 네이티브 바 버튼은 `UIBarButtonItem(customView:)` 로 **설치 시점 크기에 고정**되므로,
 * 그 안에서 캡슐 폭을 애니메이션해도 바가 다시 재지 않아 **모핑이 화면에 나오지 않았다**(04:39 PM "여전히 안 돼").
 * 바깥 자리를 두 칸으로 고정해 두면 바가 다시 잴 일이 없고, 모핑은 그 안에서 일어난다.
 *
 * 00:32 에 모핑이 보였던 것은 알약이 아직 **콘텐츠 안**(`LargeTitleRow`)에 있던 때다
 */
export const TAB_PILL_FRAME_WIDTH = TAB_PILL_CELL * 2;
