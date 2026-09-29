/**
 * 추천 테스트 탭의 "무엇이 바뀌었나" 계산 — 행동 전후의 **순위 목록**(콘텐츠 id 배열)을 비교한다.
 *
 * 화면은 서버가 준 순서를 그대로 그리고, 여기서는 직전 스냅샷과의 차이만 표시용으로 붙인다(판정이 아니다).
 * 첫 스냅샷(직전 없음)은 전부 `same` — "처음 불러온 것"을 "새로 들어옴"으로 그리면 매번 온 화면이 ▲로 덮인다.
 */
export type RankChange = { kind: "new" | "up" | "down" | "same"; delta: number };

export interface RankDiff {
  /** 다음 목록의 항목별 변화. `delta`는 순위 변화(양수 = 올라옴) */
  changes: Map<string, RankChange>;
  /** 직전에는 있었으나 다음 목록에서 빠진 id — 직전 순서대로 */
  removed: string[];
}

export function diffRanked(prev: string[] | null, next: string[]): RankDiff {
  const changes = new Map<string, RankChange>();
  if (prev === null) {
    for (const id of next) changes.set(id, { kind: "same", delta: 0 });
    return { changes, removed: [] };
  }
  const prevIndex = new Map(prev.map((id, i) => [id, i] as const));
  next.forEach((id, i) => {
    const before = prevIndex.get(id);
    if (before === undefined) { changes.set(id, { kind: "new", delta: 0 }); return; }
    const delta = before - i;
    changes.set(id, { kind: delta > 0 ? "up" : delta < 0 ? "down" : "same", delta });
  });
  const nextSet = new Set(next);
  return { changes, removed: prev.filter((id) => !nextSet.has(id)) };
}

/** 변화 표식 — ▲n(올라옴) ▼n(내려감) NEW(새로 들어옴). 같으면 빈 문자열 */
export function rankMark(change: RankChange | undefined): string {
  if (!change) return "";
  if (change.kind === "new") return "NEW";
  if (change.kind === "up") return `▲${change.delta}`;
  if (change.kind === "down") return `▼${-change.delta}`;
  return "";
}
