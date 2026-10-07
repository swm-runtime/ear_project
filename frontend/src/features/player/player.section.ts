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

/** 카드에 그릴 두 줄 — 위 큰 구역 이름과 아래 작은 요약 한 줄 */
export interface SectionDisplay {
  heading: string;
  detail: string;
}

/**
 * 구간 → 카드 표시(PM 2026-10-07). 위 큰 줄은 구역 이름 — 인트로·도입 "개요", 본문 단락 "본론", 마무리 "결론" —,
 * 아래 작은 줄은 **구간 요약 한 줄**(`summary`, 20자 이내 — 서버·파이프라인 KAN-151·152)이다. 요약이 없으면 서버 제목으로
 * 대신한다 — 본문은 단락 제목, 인트로·도입·마무리는 원래 이름("도입" 등)이라 아래 칸이 비지 않는다.
 * 서버가 구역(`kind`)을 안 실었으면 위 "지금 듣는 구간"
 */
export const sectionDisplayOf = (
  section: PlayerSection,
  copy: {
    currentSectionLabel: string;
    sectionKindLabel: Record<PlayerSectionKind, string>;
  },
): SectionDisplay => ({
  heading: section.kind === null ? copy.currentSectionLabel : copy.sectionKindLabel[section.kind],
  detail: section.summary ?? section.title,
});
