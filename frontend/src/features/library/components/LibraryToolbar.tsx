import { Animated, StyleSheet, View } from 'react-native';

import { TAB_PILL_FRAME_WIDTH, useTabPillMorph } from '@/shared/navigation/useTabPillMorph';
import { theme } from '@/shared/theme';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

import { RemainingPlaysIndicator } from '@/features/player';

import LibraryFilterButton from './LibraryFilterButton';

/** 캡슐 높이 = 검색 캡슐과 같다(HEADER_CONTROL_HEIGHT) */
const TOOLBAR_HEIGHT = HEADER_CONTROL_HEIGHT;

interface LibraryToolbarProps {
  /** null 이면 링 칸을 두지 않는다(무제한·캐시·값 없음 — uiux 4.3) */
  remaining: { remaining: number; limit: number } | null;
  onExhaustedPress: () => void;
  activeFilterCount: number;
  onFilterPress: () => void;
}

/**
 * 검색줄 오른쪽 툴바 — 잔여 링 + 필터를 **한 유리 캡슐**에 묶는다(2026-09-25 PM "유리 조각이 셋"). iOS 26 은
 * 툴바 버튼을 캡슐 하나로 묶어 유리 덩어리 수를 줄인다(Safari·메일 상단). 머리 줄은 검색 캡슐 + 이 캡슐, 둘로 끝난다.
 * 칸 사이 hairline 구분선 — 링(상태 표시)과 필터(버튼)가 한 덩어리로 읽히지 않게
 */
export default function LibraryToolbar({
  remaining,
  onExhaustedPress,
  activeFilterCount,
  onFilterPress,
}: LibraryToolbarProps) {
  // 탭 전환 모핑(useTabPillMorph) — 탐색([링])에서 오면 필터 칸이 0 → 44 로 자라난다. 링이 없으면(필터만) 모핑하지 않는다
  const filterWidth = useTabPillMorph(remaining !== null);
  return (
    // 바깥 자리는 두 칸 고정 — 네이티브 바 버튼이 다시 재지 않아도 캡슐이 이 안에서 자란다(TAB_PILL_FRAME_WIDTH)
    <View style={styles.frame} pointerEvents="box-none">
      <GlassCapsule style={styles.capsule}>
        {remaining ? (
          <View style={styles.cell}>
            <RemainingPlaysIndicator
              remaining={remaining.remaining}
              limit={remaining.limit}
              onExhaustedPress={onExhaustedPress}
              bare
            />
          </View>
        ) : null}
        <Animated.View style={[styles.morphSlot, remaining ? { width: filterWidth } : null]}>
          {remaining ? <View style={styles.divider} pointerEvents="none" /> : null}
          <View style={styles.cell}>
            <LibraryFilterButton activeCount={activeFilterCount} onPress={onFilterPress} bare />
          </View>
        </Animated.View>
      </GlassCapsule>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: TAB_PILL_FRAME_WIDTH,
    height: TOOLBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TOOLBAR_HEIGHT,
  },
  // 칸은 44 를 채운다(터치) — 캡슐(36)보다 위아래로 4 씩 넘치는 건 투명한 탭 영역뿐이다
  cell: {
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 필터 칸(구분선 + 44) — 폭이 줄면 오른쪽이 잘린다
  morphSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: TOOLBAR_HEIGHT - theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
});
