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
import GlassSurface, { GlassGroup, HAS_LIQUID_GLASS } from '@/shared/ui/GlassSurface';

interface TabMorphPillProps {
  /** 이 알약이 사는 탭 — 제 모양(라이브러리 두 칸 · 탐색 한 칸)을 정한다 */
  tab: PillTab;
  /** 왼쪽 칸 — 잔여 링. `null` 이면 모핑 없이 한 칸 알약으로 그린다 */
  ring: ReactNode | null;
  /** 오른쪽 칸 — 라이브러리의 필터. 탐색에는 없다 */
  filter?: ReactNode;
}

/** 이 거리 안으로 가까워진 유리끼리 물방울처럼 합쳐진다(UIGlassContainerEffect) */
const MERGE_SPACING = 8;

/**
 * 제목 줄 오른쪽 알약 — 탭을 오갈 때 칸이 자라고 줄어든다(PM 2026-09-28 00:32).
 *
 * **iOS 26 에서는 애플이 유리를 합치고 뗀다**(PM 06:19 "유리가 유체처럼 늘어나며 한 덩어리로 변형된 이거 원함").
 * 유리 판을 **두 조각**(링 칸 · 필터 칸)으로 두고 한 `GlassGroup`(=`UIGlassContainerEffect`)에 넣으면, 두 조각이
 * 가까워질 때 애플이 **물방울처럼 이어 붙이고** 멀어질 때 떼어 낸다 — 늘어나는 것도 떨어지는 것도 애플 코드다.
 * 우리가 움직이는 것은 조각의 **자리와 크기**뿐이다:
 *
 * - 링 판: `translateX` 로 한 칸 오른쪽으로 미끄러진다(라이브러리 왼쪽 칸 → 탐색 오른쪽 칸)
 * - 필터 판: `scaleX` 로 **오른쪽 끝을 축으로 짜부라진다** — 링이 다가오는 동안 사이가 붙어 한 덩어리로 읽힌다
 *
 * 구조는 캡슐 탭 바에서 검증된 것과 같다(`CapsuleTabBar`, 2026-09-23 PM "물방울이 합쳐지는 애니메이션") —
 * **묶음에는 유리 판만 넣고 내용물(아이콘)은 앞 층에 따로 둔다.** 같이 넣으면 겹친 유리가 한 덩어리로 뭉쳐
 * 렌즈처럼 일그러진다.
 *
 * 그 밑 OS(리퀴드 글라스 없음)는 애플의 병합이 없으므로 **캡슐 두 장을 교차 불투명도**로 바꾼다.
 *
 * 둘 다 transform·불투명도라 네이티브 드라이버이고 레이아웃 패스를 타지 않는다 — 알약은 시스템 내비게이션 바의
 * 바 버튼이고, 바 버튼은 설치 시점 크기에 고정돼 **폭(레이아웃) 애니메이션이 그려지지 않는다**(04:39 확인).
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

  const ringShift = progress.interpolate({ inputRange: [0, 1], outputRange: [TAB_PILL_CELL, 0] });

  return (
    <View style={styles.slot} pointerEvents="box-none">
      {/* 뒤 층 — 유리 판만 한 묶음에(내용물은 앞 층) */}
      {HAS_LIQUID_GLASS ? (
        <GlassGroup spacing={MERGE_SPACING} style={styles.glassLayer} pointerEvents="none">
          <Animated.View
            style={[styles.ringPlate, { transform: [{ translateX: ringShift }] }]}
            pointerEvents="none"
          >
            <GlassSurface style={styles.plateGlass} />
          </Animated.View>
          {filter ? (
            <Animated.View
              style={[styles.filterPlate, { transform: [{ scaleX: progress }] }]}
              pointerEvents="none"
            >
              <GlassSurface style={styles.plateGlass} />
            </Animated.View>
          ) : null}
        </GlassGroup>
      ) : (
        <View style={styles.glassLayer} pointerEvents="none">
          {/* 병합이 없는 OS — 두 칸 캡슐과 한 칸 캡슐을 교차 불투명도로 바꾼다 */}
          <Animated.View style={[styles.wideLayer, { opacity: progress }]}>
            <GlassCapsule style={styles.fill} />
          </Animated.View>
          <Animated.View
            style={[
              styles.narrowLayer,
              { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
            ]}
          >
            <GlassCapsule style={styles.fill} />
          </Animated.View>
        </View>
      )}

      {/* 앞 층 — 아이콘 */}
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
  // 유리 판이 사는 층 — 캡슐 높이만큼만
  glassLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: CELL_TOP,
    height: HEADER_CONTROL_HEIGHT,
  },
  plateGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  ringPlate: {
    position: 'absolute',
    left: 0,
    width: TAB_PILL_CELL,
    height: HEADER_CONTROL_HEIGHT,
    borderRadius: theme.radius.full,
  },
  // 오른쪽 끝을 축으로 짜부라진다 — 링이 다가오는 쪽(왼쪽)이 줄어든다
  filterPlate: {
    position: 'absolute',
    right: 0,
    width: TAB_PILL_CELL,
    height: HEADER_CONTROL_HEIGHT,
    borderRadius: theme.radius.full,
    transformOrigin: 'right center',
  },
  wideLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  narrowLayer: {
    position: 'absolute',
    right: 0,
    top: 0,
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
