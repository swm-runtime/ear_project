import TabMorphPill from '@/shared/navigation/TabMorphPill';

import { RemainingPlaysIndicator } from '@/features/player';

import LibraryFilterButton from './LibraryFilterButton';

interface LibraryToolbarProps {
  /** null 이면 링 칸을 두지 않는다(무제한·캐시·값 없음 — uiux 4.3) */
  remaining: { remaining: number; limit: number } | null;
  onExhaustedPress: () => void;
  activeFilterCount: number;
  onFilterPress: () => void;
}

/**
 * 검색줄 오른쪽 툴바 — 잔여 링 + 필터를 **한 유리 캡슐**에 묶는다(2026-09-25 PM "유리 조각이 셋"). iOS 26 은
 * 툴바 버튼을 캡슐 하나로 묶어 유리 덩어리 수를 줄인다(Safari·메일 상단).
 *
 * 탭을 오갈 때의 모핑(탐색 [링] ↔ 라이브러리 [링 | 필터])은 `TabMorphPill` 이 transform·불투명도로 그린다 —
 * 폭(레이아웃)으로는 시스템 바 버튼 안에서 그려지지 않는다(2026-09-28 04:55).
 */
export default function LibraryToolbar({
  remaining,
  onExhaustedPress,
  activeFilterCount,
  onFilterPress,
}: LibraryToolbarProps) {
  return (
    <TabMorphPill
      tab="Library"
      ring={
        remaining ? (
          <RemainingPlaysIndicator
            remaining={remaining.remaining}
            limit={remaining.limit}
            onExhaustedPress={onExhaustedPress}
            bare
          />
        ) : null
      }
      filter={<LibraryFilterButton activeCount={activeFilterCount} onPress={onFilterPress} bare />}
    />
  );
}
