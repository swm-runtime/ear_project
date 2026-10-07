import type { PlayerSection } from './player.types';

/**
 * 지금 듣는 구간 — `startSec ≤ 재생 위치`인 마지막 항목(player-api.md 4.1). 구간은 `startSec` 오름차순이 보장된다.
 * 구간이 없거나 첫 구간 전이면 null — 화면이 줄을 그리지 않는다(첫 구간은 0초라 실서버에서는 생기지 않는다)
 */
export const currentSectionOf = (
  sections: readonly PlayerSection[],
  positionSec: number,
): PlayerSection | null => {
  let current: PlayerSection | null = null;
  for (const section of sections) {
    if (section.startSec > positionSec) break;
    current = section;
  }
  return current;
};
