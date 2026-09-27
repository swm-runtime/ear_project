import { StyleSheet, View } from 'react-native';

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
  /**
   * 유리 없이 칸만 — **시스템 내비게이션 바에 담길 때**다(iOS 26 갈래). 유리와 그 크기 변화 애니메이션은
   * 시스템이 준다(`useSystemLargeTitle` 의 `sharesBackground`) — 그 위에 우리 캡슐을 겹치면 유리 위 유리가 된다
   * (design.md §3). JS 유리 머리 줄 갈래에서는 이 값이 없고 우리 캡슐을 그린다
   */
  bare?: boolean;
}

/**
 * 검색줄 오른쪽 툴바 — 잔여 링 + 필터를 **한 덩어리**로 묶는다(2026-09-25 PM "유리 조각이 셋"). iOS 26 은
 * 툴바 버튼을 캡슐 하나로 묶어 유리 덩어리 수를 줄인다(Safari·메일 상단). 머리 줄은 검색 캡슐 + 이 캡슐, 둘로 끝난다.
 * 칸 사이 hairline 구분선 — 링(상태 표시)과 필터(버튼)가 한 덩어리로 읽히지 않게.
 *
 * **탭 전환 모핑을 JS 로 하지 않는다**(PM 2026-09-28 04:18 "저거 리퀴드라 애플 자체 애니메이션 써야 해"). 시스템 바
 * 갈래에서 이 덩어리는 바 버튼 하나이고, 탐색의 [링]과 같은 `identifier` 로 이어져 **크기 변화를 iOS 26 이 모핑한다**.
 * 종전 `useTabPillMorph`(폭 스프링)는 네이티브 바 버튼이 설치 크기에 고정돼 화면에 나오지도 않았다 — 걷어냈다
 */
export default function LibraryToolbar({
  remaining,
  onExhaustedPress,
  activeFilterCount,
  onFilterPress,
  bare = false,
}: LibraryToolbarProps) {
  const Frame = bare ? View : GlassCapsule;
  return (
    <Frame style={styles.capsule}>
      {remaining ? (
        <>
          <View style={styles.cell}>
            <RemainingPlaysIndicator
              remaining={remaining.remaining}
              limit={remaining.limit}
              onExhaustedPress={onExhaustedPress}
              bare
            />
          </View>
          <View style={styles.divider} pointerEvents="none" />
        </>
      ) : null}
      <View style={styles.cell}>
        <LibraryFilterButton activeCount={activeFilterCount} onPress={onFilterPress} bare />
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TOOLBAR_HEIGHT,
  },
  // 칸은 44 를 채운다(터치) — 캡슐(40)보다 위아래로 2 씩 넘치는 건 투명한 탭 영역뿐이다
  cell: {
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: TOOLBAR_HEIGHT - theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
});
