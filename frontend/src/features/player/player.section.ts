import type { PlayerSection, PlayerSectionKind } from './player.types';

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

/** 카드에 그릴 두 줄 — 위 작은 라벨(없으면 null)과 아래 큰 제목 */
export interface SectionDisplay {
  label: string | null;
  title: string;
}

/**
 * 구간 → 카드 표시(PM 2026-10-07). 본문 단락은 라벨 "본론" + 단락 제목, 인트로·도입·마무리는 구역 이름이 곧 제목이라
 * 라벨 없이 "개요"·"결론" 한 줄. 서버가 구역(`kind`)을 안 실었으면 종전처럼 "지금 듣는 구간" + 제목
 */
export const sectionDisplayOf = (
  section: PlayerSection,
  copy: {
    currentSectionLabel: string;
    sectionKindLabel: Record<PlayerSectionKind, string>;
  },
): SectionDisplay => {
  if (section.kind === null) return { label: copy.currentSectionLabel, title: section.title };
  if (section.kind === 'body') {
    return { label: copy.sectionKindLabel.body, title: section.title };
  }
  return { label: null, title: copy.sectionKindLabel[section.kind] };
};
