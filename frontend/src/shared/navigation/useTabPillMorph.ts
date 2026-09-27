import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Animated } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

/**
 * 탭을 오갈 때 제목 줄 오른쪽 알약이 **모양을 이어받아 변한다**(PM 2026-09-28 00:32 "라이브러리 ↔ 탐색 이동할 때 알약이
 * 바뀐다 — 애니메이션 넣자"). 라이브러리 알약은 [링 | 필터], 탐색 알약은 [링]. 직전 탭의 알약에 "여분 칸"(필터 칸)이
 * 있었는지를 기억해 두고, 포커스될 때 여분 칸 폭을 직전 값 → 이 탭의 값으로 스프링한다:
 * 탐색 → 라이브러리면 필터 칸이 0 → 44 로 자라고, 라이브러리 → 탐색이면 44 → 0 으로 줄어든다.
 *
 * 폭은 레이아웃이라 JS 드라이버 — 탭 전환 직후 한 번, 짧은 스프링이다
 */
let lastExtraCellOpen = false;

export const useTabPillMorph = (hasExtraCell: boolean): Animated.AnimatedInterpolation<number> => {
  const progress = useAnimatedValue(hasExtraCell ? 1 : 0);
  useFocusEffect(
    useCallback(() => {
      const from = lastExtraCellOpen ? 1 : 0;
      const to = hasExtraCell ? 1 : 0;
      lastExtraCellOpen = hasExtraCell;
      if (from === to) {
        progress.setValue(to);
        return;
      }
      progress.setValue(from);
      Animated.spring(progress, {
        toValue: to,
        ...motion.spring.snappy,
        overshootClamping: true,
        useNativeDriver: false,
      }).start();
    }, [hasExtraCell, progress]),
  );
  return progress.interpolate({ inputRange: [0, 1], outputRange: [0, TAB_PILL_CELL] });
};

/** 알약 한 칸 폭 — 터치 최소 폭(44) */
export const TAB_PILL_CELL = theme.touchTarget.minWidth;
