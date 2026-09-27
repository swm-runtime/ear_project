import { useEffect } from 'react';
import { Animated } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { useTabSelectionStore } from '@/shared/navigation/tab-selection.store';
import { motion, theme } from '@/shared/theme';

/** 알약 한 칸 폭 — 터치 최소 폭(44) */
export const TAB_PILL_CELL = theme.touchTarget.minWidth;

/** 알약이 앉는 자리의 **고정 폭**(두 칸) — 바 버튼이 다시 재지 않아도 되게 한다(아래 주석) */
export const TAB_PILL_SLOT = TAB_PILL_CELL * 2;

/** 알약이 있는 탭과 그 칸 수 — 모핑은 이 둘 사이에서만 일어난다 */
const PILL_TABS: Record<string, number> = { Library: 2, Explore: 1 };

/** 두 칸 모양 = 1 · 한 칸 모양 = 0 */
const shapeOf = (tab: string): number => (PILL_TABS[tab] === 2 ? 1 : 0);

export type PillTab = 'Library' | 'Explore';

/**
 * 탭을 오갈 때 제목 줄 오른쪽 알약이 **모양을 이어받아 변한다**(PM 2026-09-28 00:32). 라이브러리는 [링 | 필터],
 * 탐색은 [링]. 이 훅은 그 진행도(한 칸 0 ↔ 두 칸 1)를 준다.
 *
 * **레이아웃이 아니라 transform·불투명도로 그린다**(PM 2026-09-28 04:55 "무조건 2번이고 애니메이션 있어야 해").
 * 알약은 02:53 부터 시스템 내비게이션 바의 바 버튼이고(`useSystemLargeTitle` → `unstable_headerRightItems`),
 * 네이티브 바 버튼은 `UIBarButtonItem(customView:)` 로 **설치 시점 크기에 고정**된다 — 그 안에서 폭(레이아웃)을
 * 애니메이션해도 바가 다시 재지 않아 화면에 나오지 않았다(04:39 확인, 자리를 고정해도 안 됐다 → 안쪽 레이아웃 자체가
 * 다시 돌지 않는다). transform 은 레이아웃 패스를 타지 않으므로 고정된 크기와 무관하게 그려진다.
 *
 * 그래서 자리는 두 칸(`TAB_PILL_SLOT`)으로 고정해 두고, 그 안에서 **캡슐 두 장을 교차 불투명도**로 바꾸고 **링을 한 칸
 * 밀어** 자라남·줄어듦을 만든다(`TabMorphPill`). 전부 네이티브 드라이버다.
 *
 * 판정은 선택된 탭(`tab-selection.store`)만 본다 — 포커스·blur 이벤트를 쓰지 않는다(이유는 스토어 주석).
 */
export const useTabPillMorph = (tab: PillTab, enabled = true): Animated.Value => {
  const rest = shapeOf(tab);
  const progress = useAnimatedValue(rest);
  const selected = useTabSelectionStore((s) => s.selected);

  useEffect(() => {
    if (!enabled || selected === null) return;
    if (selected !== tab) {
      /*
       * **출발점은 안 보이는 동안 맞춘다**(PM 2026-09-28 06:12 "약간 튕긴다"). 들어온 뒤에 맞추면 알약이 제 모양으로
       * 한 프레임 그려졌다가 출발점으로 튀고 다시 자란다 — 00:42 에 같은 증상을 겪고 blur 로 옮겼던 이유다.
       * 지금 선택된 탭이 다른 알약 탭이면 그 모양으로, 알약 없는 탭(프로필)이면 제 모양으로 둔다(돌아올 때 가만히 있게).
       */
      progress.setValue(selected in PILL_TABS ? shapeOf(selected) : rest);
      return;
    }
    // 들어왔다 — 출발점은 이미 맞춰져 있으니 제 모양으로 잇는다
    Animated.spring(progress, {
      toValue: rest,
      ...motion.spring.snappy,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }, [selected, tab, rest, enabled, progress]);

  return progress;
};
