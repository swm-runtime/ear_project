import SegmentedControl from '@/shared/ui/SegmentedControl';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExplorePeriod } from '../explore.types';

/** iOS 기본 세그먼트는 전체 32 — 안쪽 2 를 빼면 칸 28 */
const SYSTEM_SEGMENT_HEIGHT = 28;

interface PopularPeriodToggleProps {
  /** 선택 상태의 근거는 서버 응답의 period다 — 클라이언트 기본값이 없다(uiux 4.10) */
  selected: ExplorePeriod;
  onSelect: (period: ExplorePeriod) => void;
  /** 전환 중 중복 탭 차단(uiux 4.10) */
  disabled: boolean;
}

/** 라벨은 화면 문구, 값은 전송값 — 순서는 uiux 4.10의 "주간 · 월간 · 전체"다 */
const PERIODS: ExplorePeriod[] = ['week', 'month', 'all'];
const OPTIONS = PERIODS.map((value) => ({ value, label: EXPLORE_COPY.popular.periodLabels[value] }));

/**
 * E13 인기 구간 토글 — 인기 섹션 제목 줄에만 붙는 3택 1. 확정 구간이 없어도 세 구간 모두 항상 고를 수 있다 —
 * 탭을 숨기거나 비활성화하지 않는다(explore.md 4.1-1 · uiux 8장). 모양·모션은 공용 SegmentedControl(2026-09-23)
 */
export default function PopularPeriodToggle({
  selected,
  onSelect,
  disabled,
}: PopularPeriodToggleProps) {
  return (
    <SegmentedControl
      options={OPTIONS}
      value={selected}
      onChange={onSelect}
      disabled={disabled}
      accessibilityLabel={EXPLORE_COPY.popular.toggleA11y}
      // 콘텐츠 층의 토글 — iOS 기본 세그먼트 모양(PM 2026-09-25 "리퀴드 말고 애플 기본 토글")
      appearance="system"
      segmentHeight={SYSTEM_SEGMENT_HEIGHT}
    />
  );
}
