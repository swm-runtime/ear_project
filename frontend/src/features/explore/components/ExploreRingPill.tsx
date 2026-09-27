import TabMorphPill from '@/shared/navigation/TabMorphPill';

import { RemainingPlaysIndicator } from '@/features/player';

interface ExploreRingPillProps {
  remaining: number;
  limit: number;
  onExhaustedPress: () => void;
}

/**
 * 탐색 제목 줄 오른쪽 알약 — 잔여 링 한 칸. 라이브러리 툴바([링 | 필터])와 **같은 껍데기**(`TabMorphPill`)를 써,
 * 탭을 오갈 때 알약이 **한 칸으로 줄어들고 두 칸으로 자라는 것**이 보인다(PM 2026-09-28 00:32 · 04:55).
 */
export default function ExploreRingPill({
  remaining,
  limit,
  onExhaustedPress,
}: ExploreRingPillProps) {
  return (
    <TabMorphPill
      tab="Explore"
      ring={
        <RemainingPlaysIndicator
          remaining={remaining}
          limit={limit}
          onExhaustedPress={onExhaustedPress}
          bare
        />
      }
    />
  );
}
