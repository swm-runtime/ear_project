import { Animated, StyleSheet, View } from 'react-native';

import { TAB_PILL_FRAME_WIDTH, useTabPillMorph } from '@/shared/navigation/useTabPillMorph';
import { theme } from '@/shared/theme';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

import { RemainingPlaysIndicator } from '@/features/player';

interface ExploreRingPillProps {
  remaining: number;
  limit: number;
  onExhaustedPress: () => void;
}

/**
 * 탐색 제목 줄 오른쪽 알약 — 잔여 링 한 칸. 라이브러리 알약([링 | 필터])과 **같은 유리 캡슐·같은 칸**으로 그려,
 * 탭을 오갈 때 필터 칸이 줄었다 자라는 것만 보이게 한다(useTabPillMorph, PM 2026-09-28 00:32). 라이브러리에서 오면
 * 비어 있는 여분 칸이 44 → 0 으로 줄어든다
 */
export default function ExploreRingPill({
  remaining,
  limit,
  onExhaustedPress,
}: ExploreRingPillProps) {
  const extraWidth = useTabPillMorph(false);
  return (
    // 바깥 자리는 두 칸 고정 — 네이티브 바 버튼이 다시 재지 않아도 캡슐이 이 안에서 줄어든다(TAB_PILL_FRAME_WIDTH)
    <View style={styles.frame} pointerEvents="box-none">
      <GlassCapsule style={styles.capsule}>
        <View style={styles.cell}>
          <RemainingPlaysIndicator
            remaining={remaining}
            limit={limit}
            onExhaustedPress={onExhaustedPress}
            bare
          />
        </View>
        <Animated.View style={{ width: extraWidth }} pointerEvents="none" />
      </GlassCapsule>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: TAB_PILL_FRAME_WIDTH,
    height: HEADER_CONTROL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_CONTROL_HEIGHT,
  },
  cell: {
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
