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

/**
 * 위치가 몇 번째 구간인가(0부터) — 0초가 아닌 시작 시각 중 위치 이하인 것의 개수. 끄는 동안 이 값이 바뀌면
 * 구간 경계를 넘은 것이다(약한 진동, PM 2026-10-07)
 */
export const chapterIndexOf = (startsSec: readonly number[], positionSec: number): number =>
  startsSec.filter((start) => start > 0 && start <= positionSec).length;

/** 재생 바의 한 조각 — 전체 길이 중 몫(0~1)과 그 조각이 채워진 정도(0~1) */
export interface ChapterSegment {
  share: number;
  fill: number;
}

/**
 * 구간 시작 시각으로 재생 바를 조각낸다(애플 팟캐스트 챕터 바, PM 2026-10-07). 0초와 길이 밖의 경계는 버린다 —
 * 경계가 하나도 없으면 빈 배열이라 화면은 종전처럼 한 줄 바를 그린다
 */
export const chapterSegmentsOf = (
  startsSec: readonly number[],
  durationSec: number,
  positionSec: number,
): ChapterSegment[] => {
  if (durationSec <= 0) return [];
  const boundaries = startsSec
    .filter((start) => start > 0 && start < durationSec)
    .filter((start, index, all) => index === 0 || start > all[index - 1]);
  if (boundaries.length === 0) return [];
  const edges = [0, ...boundaries, durationSec];
  return edges.slice(0, -1).map((start, index) => {
    const length = edges[index + 1] - start;
    return {
      share: length / durationSec,
      fill: Math.min(1, Math.max(0, (positionSec - start) / length)),
    };
  });
};
