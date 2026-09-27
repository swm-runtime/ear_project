import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

import { RemainingPlaysIndicator } from '@/features/player';

interface ExploreRingPillProps {
  remaining: number;
  limit: number;
  onExhaustedPress: () => void;
  /**
   * 유리 없이 칸만 — **시스템 내비게이션 바에 담길 때**다(iOS 26 갈래). 유리와 전환 애니메이션은 시스템이 준다
   * (`useSystemLargeTitle` 의 `sharesBackground`). JS 유리 머리 줄 갈래에서는 우리 캡슐을 그린다
   */
  bare?: boolean;
}

/**
 * 탐색 제목 줄 오른쪽 알약 — 잔여 링 한 칸. 라이브러리 툴바([링 | 필터])와 **같은 칸 규격**이라, 시스템 바 갈래에서는
 * 같은 `identifier` 의 바 버튼으로 이어져 **크기 변화를 iOS 26 이 모핑한다**(PM 2026-09-28 04:18 "저거 리퀴드라 애플
 * 자체 애니메이션 써야 해"). JS 로 폭을 스프링하던 `useTabPillMorph` 는 걷어냈다 — 네이티브 바 버튼이 설치 크기에
 * 고정돼 화면에 나오지 않았다
 */
export default function ExploreRingPill({
  remaining,
  limit,
  onExhaustedPress,
  bare = false,
}: ExploreRingPillProps) {
  const Frame = bare ? View : GlassCapsule;
  return (
    <Frame style={styles.capsule}>
      <View style={styles.cell}>
        <RemainingPlaysIndicator
          remaining={remaining}
          limit={limit}
          onExhaustedPress={onExhaustedPress}
          bare
        />
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
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
