import {
  useFocusEffect,
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
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
 *
 * **모달이 덮은 blur 는 탭 이동이 아니다**(PM 2026-09-28 01:35 "플레이어를 켰는데 상단 알약이 왜 움직여"). 포커스는
 * 계층적이라 플레이어(루트 스택 모달)가 탭을 덮으면 탭 화면도 blur 되는데, 그때 선택된 탭은 **여전히 이 탭**이다.
 * 이름을 보지 않으면 자기 탭을 "다음 탭"으로 읽어 반대 모양으로 튀고, 플레이어를 닫을 때 제 모양으로 돌아오며 움직인다.
 * 그래서 포커스 때 이 화면의 탭 이름을 적어 두고, 선택된 탭이 그대로면 손대지 않는다.
 */
export const useTabPillMorph = (hasExtraCell: boolean): Animated.AnimatedInterpolation<number> => {
  const own = hasExtraCell ? 1 : 0;
  const progress = useAnimatedValue(own);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  /** 이 화면을 품은 탭의 이름 — blur 가 "탭 이동"인지 "모달이 덮음"인지 가른다 */
  const ownTabRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const tabNavigation = findTabNavigation(navigation);
    if (!tabNavigation) return undefined;
    return tabNavigation.addListener('blur', () => {
      const state = tabNavigation.getState();
      const next = state?.routes[state.index]?.name;
      // 선택된 탭이 그대로면 탭 이동이 아니라 모달이 덮은 것이다 — 모양을 건드리지 않는다
      if (!next || next === ownTabRef.current) return;
      // 다음 탭이 다른 알약 탭이면 그쪽 모양(여분 칸 반대)으로 — 돌아올 때의 출발점이 된다
      if (PILL_TABS.has(next)) progress.setValue(1 - own);
    });
  }, [navigation, progress, own]);

  useFocusEffect(
    useCallback(() => {
      const state = findTabNavigation(navigation)?.getState();
      ownTabRef.current = state?.routes[state.index]?.name;
      Animated.spring(progress, {
        toValue: own,
        ...motion.spring.snappy,
        overshootClamping: true,
        useNativeDriver: false,
      }).start();
    }, [own, progress, navigation]),
  );
  return progress.interpolate({ inputRange: [0, 1], outputRange: [0, TAB_PILL_CELL] });
};

/** 알약 한 칸 폭 — 터치 최소 폭(44) */
export const TAB_PILL_CELL = theme.touchTarget.minWidth;
