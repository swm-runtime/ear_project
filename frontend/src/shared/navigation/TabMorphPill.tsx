import type { ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import {
  TAB_PILL_CELL,
  TAB_PILL_SLOT,
  useTabPillMorph,
  type PillTab,
} from '@/shared/navigation/useTabPillMorph';
import { theme } from '@/shared/theme';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

interface TabMorphPillProps {
  /** 이 알약이 사는 탭 — 제 모양(라이브러리 두 칸 · 탐색 한 칸)을 정한다 */
  tab: PillTab;
  /** 왼쪽 칸 — 잔여 링. `null` 이면 모핑 없이 한 칸 알약으로 그린다 */
  ring: ReactNode | null;
  /** 오른쪽 칸 — 라이브러리의 필터. 탐색에는 없다 */
  filter?: ReactNode;
}

/**
 * 제목 줄 오른쪽 알약 — 탭을 오갈 때 **한 덩어리 캡슐이 늘어나고 줄어든다**(PM 2026-09-28 00:32 · 06:46).
 *
 * **유리는 언제나 한 장이다.** 넓은 캡슐과 좁은 캡슐을 겹쳐 교차시키면 iOS 26 에서 두 덩어리로 갈라져 보였다
 * (06:28·06:45 실기기 — 유리 위 유리는 밑의 유리를 샘플링하지 않는다, design.md §3). 애플의 유리 병합
 * (`GlassGroup` = `UIGlassContainerEffect`)도 시스템 내비게이션 바의 바 버튼 안에서는 먹지 않았다(06:28).
 *
 * 그래서 **한 장을 `scaleX` 로 늘였다 줄인다.** 축은 오른쪽 끝(바의 바깥 여백에 붙어 있는 변)이다:
 *
 * - 탐색에서 라이브러리로 오면 캡슐이 한 칸 → 두 칸으로 **자란다**(0.5 → 1)
 * - 라이브러리에서 탐색으로 오면 두 칸 → 한 칸으로 **줄어든다**(2 → 1)
 * - 쉴 때는 언제나 `scaleX: 1` 이라 **모서리가 눌리지 않는다**(지나가는 동안만 곡률이 늘어난다)
 *
 * 아이콘(링·필터)은 **캡슐 밖 층**에 둔다 — 같이 스케일되면 링이 타원이 된다. 링은 캡슐의 왼쪽 끝을 따라
 * 한 칸 미끄러지고, 필터는 불투명도로 든다/난다.
 *
 * 전부 transform·불투명도라 네이티브 드라이버이고 레이아웃 패스를 타지 않는다 — 알약은 바 버튼이고, 바 버튼은
 * 설치 시점 크기에 고정돼 **폭(레이아웃) 애니메이션이 그려지지 않는다**(04:39 확인).
 */
export default function TabMorphPill({ tab, ring, filter }: TabMorphPillProps) {
  const morphs = ring !== null;
  const progress = useTabPillMorph(tab, morphs);

  // 링이 없는 라이브러리(무제한·값 없음)는 필터만 있는 한 칸 알약이다 — 이어받을 모양이 없으니 모핑하지 않는다
  if (!morphs) {
    return (
      <GlassCapsule style={styles.oneCell}>
        <View style={styles.cell}>{filter}</View>
      </GlassCapsule>
    );
  }

  /** 내 칸 수(라이브러리 2 · 탐색 1) */
  const cells = filter ? 2 : 1;
  /** 레이아웃상 캡슐의 왼쪽 끝 — 캡슐은 자리의 오른쪽 끝에 붙는다 */
  const restLeft = TAB_PILL_SLOT - cells * TAB_PILL_CELL;

  /*
   * 진행도는 **보이는 칸 수**다 — 0 이면 한 칸, 1 이면 두 칸(`useTabPillMorph` 의 정의). 그래서 배율은
   * `보이는 칸 / 내 칸` 이다. 제 모양(라이브러리 1 · 탐색 0)에서는 언제나 1 이 된다.
   * 종전에는 "진행도 1 = 제 모양"으로 잘못 환산해 **탐색 알약이 쉴 때도 두 칸 폭으로 늘어나 있었다**
   * (PM 2026-09-28 12:40 스크린샷).
   */
  const capsuleScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1 / cells, 2 / cells],
  });
  // 링은 캡슐의 왼쪽 끝을 따라간다 — 줄어든 캡슐 밖으로 링이 나가면 안 된다
  const ringShift = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [TAB_PILL_CELL - restLeft, -restLeft],
  });

  return (
    <View style={styles.slot} pointerEvents="box-none">
      {/* 유리 한 장 — 오른쪽 끝을 축으로 늘어나고 줄어든다 */}
      <Animated.View
        style={[
          styles.capsuleLayer,
          { width: cells * TAB_PILL_CELL, transform: [{ scaleX: capsuleScale }] },
        ]}
        pointerEvents="none"
      >
        <GlassCapsule style={styles.fill} />
      </Animated.View>

      {/* 아이콘 층 — 스케일 밖이라 일그러지지 않는다 */}
      <Animated.View
        style={[styles.ringCell, { left: restLeft, transform: [{ translateX: ringShift }] }]}
        pointerEvents="box-none"
      >
        {ring}
      </Animated.View>
      {filter ? (
        <>
          <Animated.View style={[styles.divider, { opacity: progress }]} pointerEvents="none" />
          <Animated.View
            style={[styles.filterCell, { opacity: progress }]}
            pointerEvents="box-none"
          >
            {filter}
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

/** 칸은 44 를 채운다(터치) — 캡슐(40)보다 위아래로 2 씩 넘치는 건 투명한 탭 영역뿐이다 */
const CELL_TOP = (theme.touchTarget.minHeight - HEADER_CONTROL_HEIGHT) / 2;

const styles = StyleSheet.create({
  // 자리는 두 칸 고정 — 늘어난 캡슐이 잘리지 않게(바 버튼은 설치 크기에 고정된다)
  slot: {
    width: TAB_PILL_SLOT,
    height: theme.touchTarget.minHeight,
  },
  oneCell: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_CONTROL_HEIGHT,
  },
  cell: {
    width: TAB_PILL_CELL,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },
  capsuleLayer: {
    position: 'absolute',
    right: 0,
    top: CELL_TOP,
    height: HEADER_CONTROL_HEIGHT,
    transformOrigin: 'right center',
  },
  ringCell: {
    position: 'absolute',
    top: 0,
    width: TAB_PILL_CELL,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCell: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: TAB_PILL_CELL,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 칸 사이 hairline — 링(상태 표시)과 필터(버튼)가 한 덩어리로 읽히지 않게
  divider: {
    position: 'absolute',
    right: TAB_PILL_CELL,
    top: CELL_TOP + theme.spacing.sm,
    width: StyleSheet.hairlineWidth,
    height: HEADER_CONTROL_HEIGHT - theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
});
