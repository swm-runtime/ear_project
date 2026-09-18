/**
 * 재생 목록의 사용자 지정 순서(2026-09-18).
 *
 * 재생 목록의 원천은 "필터 없는 라이브러리 첫 페이지"이고 서버에는 순서를 저장할 자리가 없다
 * (`changes/pending/player-queue-panel.md`). 그래서 순서는 **기기에만** 둔다 — 항목 id 의 나열을 저장해 두고,
 * 받아 온 목록 위에 덮어 정렬한다. 판정이 아니라 표시 순서라 클라이언트가 가져도 되는 값이다.
 */

/** 저장해 두는 id 개수의 상한 — 첫 페이지보다 넉넉하게. 지워진 항목의 id 가 끝없이 쌓이지 않게 한다 */
export const QUEUE_ORDER_MAX_IDS = 200;

/**
 * 받아 온 목록에 저장된 순서를 입힌다.
 * - 저장된 순서에 있는 항목: 그 순서대로.
 * - 저장된 순서에 없는 항목(새로 담긴 것): **맨 위에**, 서버가 준 순서 그대로 — 라이브러리가 최신순이라
 *   새 항목이 위에 오는 것이 같은 감각이다. 사용자가 정리한 아래쪽 순서는 건드리지 않는다.
 * - 저장된 순서에만 있고 목록에 없는 id(삭제·다음 페이지)는 무시한다.
 */
export const applyQueueOrder = <T extends { itemId: string }>(
  items: T[],
  savedIds: readonly string[],
): T[] => {
  if (savedIds.length === 0) return items;
  const rank = new Map(savedIds.map((id, index) => [id, index]));
  const fresh = items.filter((item) => !rank.has(item.itemId));
  const known = items
    .filter((item) => rank.has(item.itemId))
    .sort((a, b) => (rank.get(a.itemId) ?? 0) - (rank.get(b.itemId) ?? 0));
  return [...fresh, ...known];
};

/** `from` 자리의 원소를 `to` 자리로 옮긴 새 배열. 범위 밖이거나 같은 자리면 원본을 그대로 돌려준다 */
export const moveInArray = <T>(list: readonly T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/** 저장용 직렬화 — 상한을 넘기면 뒤(오래 정리한 쪽)를 버린다 */
export const serializeQueueOrder = (ids: readonly string[]): string =>
  JSON.stringify(ids.slice(0, QUEUE_ORDER_MAX_IDS));

/** 저장값 복원 — 깨졌거나 모양이 다르면 "순서 없음"으로 본다(던지지 않는다) */
export const parseQueueOrder = (raw: string | null): string[] => {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};
