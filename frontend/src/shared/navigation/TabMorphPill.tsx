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
 * 제목 줄 오른쪽 알약 — 탭을 오갈 때 **칸이 자라고 줄어드는** 모핑을 가진 껍데기(PM 2026-09-28 00:32 · 04:55).
 *
 * 알약은 시스템 내비게이션 바의 바 버튼 안에서 그려지고, 그 크기는 설치 시점에 고정된다. 그래서
 *
 * - **자리는 두 칸으로 고정**한다(`TAB_PILL_SLOT`) — 바가 다시 잴 일이 없다.
 * - 캡슐은 **두 장**(두 칸 폭 · 한 칸 폭)을 겹쳐 두고 **교차 불투명도**로 바꾼다 — 쉴 때는 각 탭의 제 모양이 그대로라
 *   모서리가 눌리지 않는다(폭을 scaleX 로 늘이면 쉬는 동안 알약 끝이 납작해진다).
 * - 링은 **한 칸 밀어**(translateX) 좁은 알약 안(오른쪽)과 넓은 알약 안(왼쪽)을 오간다.
 * - 필터 칸과 구분선은 **불투명도**로 든다/난다.
 *
 * 전부 transform·불투명도라 네이티브 드라이버이고, 레이아웃 패스를 타지 않는다. 지나가는 동안 유리 두 장이 겹치지만
 * (한 장이 사라지는 중이라) 잔상은 남지 않는다 — 쉴 때는 언제나 한 장이다(design.md §3).
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

  const narrow = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const ringShift = progress.interpolate({ inputRange: [0, 1], outputRange: [TAB_PILL_CELL, 0] });

  return (
    <View style={styles.slot} pointerEvents="box-none">
      {/* 두 칸 캡슐(라이브러리 모양) */}
      <Animated.View style={[styles.wideLayer, { opacity: progress }]} pointerEvents="none">
        <GlassCapsule style={styles.fill} />
      </Animated.View>
      {/* 한 칸 캡슐(탐색 모양) */}
      <Animated.View style={[styles.narrowLayer, { opacity: narrow }]} pointerEvents="none">
        <GlassCapsule style={styles.fill} />
      </Animated.View>
      <Animated.View
        style={[styles.ringCell, { transform: [{ translateX: ringShift }] }]}
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
  wideLayer: {
    position: 'absolute',
    right: 0,
    top: CELL_TOP,
    width: TAB_PILL_SLOT,
    height: HEADER_CONTROL_HEIGHT,
  },
  narrowLayer: {
    position: 'absolute',
    right: 0,
    top: CELL_TOP,
    width: TAB_PILL_CELL,
    height: HEADER_CONTROL_HEIGHT,
  },
  ringCell: {
    position: 'absolute',
    left: 0,
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
    left: TAB_PILL_CELL,
    top: CELL_TOP + theme.spacing.sm,
    width: StyleSheet.hairlineWidth,
    height: HEADER_CONTROL_HEIGHT - theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
});
