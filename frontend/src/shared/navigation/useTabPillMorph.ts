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
 * 탐색 알약은 [링]. 여분 칸(필터 칸) 폭 0 ↔ 44 를 스프링으로 잇는다. 폭은 레이아웃이라 JS 드라이버다.
 *
 * **판정은 탭 내비게이터의 `state` 이벤트로 한다** — 포커스·blur 이벤트가 아니다(03:58 PM "애니메이션 넣기로 했는데
 * 적용이 안 된다"). 이유가 둘이다:
 *
 * - blur 시점에 선택된 탭이 이미 다음 탭인지 아직 이전 탭인지가 보장되지 않는다. 그 순서에 기대면 조건이 전부
 *   빗나가 **아무 것도 움직이지 않는다**(01:35 에 모달 오작동을 막으려 넣은 이름 비교가 이 경우를 걸러 버렸다).
 * - 플레이어 같은 모달은 **탭 상태를 바꾸지 않는다** — 그래서 상태 비교는 "모달이 덮었을 때 알약이 움직이는"
 *   문제(01:35 PM)에 저절로 면역이다. 포커스는 계층적이라 모달이 덮이면 탭 화면도 blur 된다.
 *
 * 들어올 때: 떠나온 탭이 알약 탭이면 **그 탭의 모양에서** 출발해 제 모양으로 자란다/줄어든다. 알약 없는 탭(프로필)에서
 * 오면 제 모양 그대로 둔다. 떠날 때: 다음이 알약 탭이면 보이지 않는 동안 미리 반대 모양으로 바꿔 둬, 돌아올 때
 * 첫 프레임이 제 모양으로 그려졌다 튀는 것을 막는다(00:42 PM "갑자기 튕긴다").
 */
export const useTabPillMorph = (hasExtraCell: boolean): Animated.AnimatedInterpolation<number> => {
  const own = hasExtraCell ? 1 : 0;
  const progress = useAnimatedValue(own);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  /** 이 화면을 품은 탭의 이름 — 들어오는 쪽인지 떠나는 쪽인지 가른다 */
  const ownTabRef = useRef<string | undefined>(undefined);
  /** 직전에 선택돼 있던 탭 — state 이벤트에는 이전 값이 실려오지 않는다 */
  const previousTabRef = useRef<string | undefined>(undefined);
  /** 리스너가 읽는 최신 제 모양(링이 뒤늦게 생기면 값이 바뀐다) */
  const ownValueRef = useRef(own);

  useEffect(() => {
    ownValueRef.current = own;
  }, [own]);

  useFocusEffect(
    useCallback(() => {
      const state = findTabNavigation(navigation)?.getState();
      ownTabRef.current = state?.routes[state.index]?.name;
    }, [navigation]),
  );

  useEffect(() => {
    const tabNavigation = findTabNavigation(navigation);
    if (!tabNavigation) return undefined;
    const selectedTab = (): string | undefined => {
      const state = tabNavigation.getState();
      return state?.routes[state.index]?.name;
    };
    previousTabRef.current = previousTabRef.current ?? selectedTab();
    return tabNavigation.addListener('state', () => {
      const next = selectedTab();
      const previous = previousTabRef.current;
      // 선택된 탭이 그대로면 탭 이동이 아니다(모달·탭 안 스택 이동) — 알약을 건드리지 않는다
      if (next === undefined || next === previous) return;
      previousTabRef.current = next;

      const mine = ownTabRef.current;
      const target = ownValueRef.current;
      if (next === mine) {
        // 들어온다 — 알약 탭에서 왔으면 그 모양에서 출발한다
        progress.setValue(previous !== undefined && PILL_TABS.has(previous) ? 1 - target : target);
        Animated.spring(progress, {
          toValue: target,
          ...motion.spring.snappy,
          overshootClamping: true,
          useNativeDriver: false,
        }).start();
      } else if (previous === mine && PILL_TABS.has(next)) {
        // 떠난다 — 보이지 않는 동안 돌아올 때의 출발점을 맞춰 둔다
        progress.setValue(1 - target);
      }
    });
  }, [navigation, progress]);

  // 링이 뒤늦게 생기거나 사라져 제 모양이 바뀌면 그 자리에서 잇는다(첫 렌더는 초기값 그대로 둔다)
  const isFirstRef = useRef(true);
  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }
    Animated.spring(progress, {
      toValue: own,
      ...motion.spring.snappy,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  }, [own, progress]);

  return progress.interpolate({ inputRange: [0, 1], outputRange: [0, TAB_PILL_CELL] });
};

/** 알약 한 칸 폭 — 터치 최소 폭(44) */
export const TAB_PILL_CELL = theme.touchTarget.minWidth;

/**
 * 알약이 앉는 **바깥 자리의 고정 폭**(두 칸) — 알약 자체는 이 안에서 오른쪽에 붙어 폭만 변한다.
 *
 * 알약은 시스템 내비게이션 바의 바 버튼이다(`useSystemLargeTitle` → `unstable_headerRightItems`). 네이티브 바 버튼은
 * **설치 시점의 크기로 고정**되므로(`UIBarButtonItem(customView:)`), 안에서 캡슐 폭을 애니메이션해도 바가 다시 재지 않아
 * **모핑이 화면에 나오지 않았다**(PM 2026-09-28 04:10 "왜 탭 전환할 때 리퀴드 캡슐 애니메이션이 안 되지"). 바깥 자리를
 * 두 칸으로 고정해 두면 바가 다시 잴 일이 없고, 그 안에서 캡슐이 44 ↔ 88 로 자란다/줄어든다.
 */
export const TAB_PILL_FRAME_WIDTH = TAB_PILL_CELL * 2;
