/**
 * 재생 목록의 사용자 지정 순서.
 *
 * **순서의 진실은 서버다**(library-api.md 4.1 `sort=queue` · 4.8, KAN-70·74 — 2026-09-19). 목록은 서버가
 * 입힌 순서 그대로 그리고, 클라이언트는 순서 규칙을 다시 계산하지 않는다 — 두 규칙이 어긋나면 원인을
 * 찾을 수 없다. 여기 남은 것은 끌기 직후의 화면 반영(`moveInArray`)과, 기기 저장 시절(2026-09-18,
 * `player.queue_order`)의 값을 서버로 한 번 올리기 위한 복원(`parseQueueOrder`)뿐이다.
 */

/** 한 번에 보내는 id 개수의 상한 — 서버 계약(4.8: 1~200개)과 같다 */
export const QUEUE_ORDER_MAX_IDS = 200;

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

/**
 * 패널이 보여 준 순서(`shownKeys`)를 전체 목록에 입힌다(KAN-254 원인 1·5) — 패널 목록은 전체 캐시와 다를 수 있다: 삭제 대기
 * 줄은 빠져 있고(숨김), 라이브러리 첫 페이지 밖의 지금 듣는 편은 맨 위에 더해져 있다. **보인 줄이 차지하던 자리에만** 새 순서를
 * 차례로 채우고, 숨긴 줄은 제자리, 전체에 없는 키는 건너뛴다. 인덱스가 아니라 키로 옮기므로 앞 끌기의 순서가 아직 렌더에
 * 반영되지 않았어도 엉뚱한 줄을 옮기지 않는다. 순서가 그대로면 null
 */
export const reorderSubset = <T>(
  full: readonly T[],
  keyOf: (item: T) => string,
  shownKeys: readonly string[],
): T[] | null => {
  const indexOf = new Map(full.map((item, index) => [keyOf(item), index]));
  const seen = new Set<string>();
  const sequence: T[] = [];
  for (const key of shownKeys) {
    const index = indexOf.get(key);
    if (index === undefined || seen.has(key)) continue;
    seen.add(key);
    sequence.push(full[index]);
  }
  const slots = full.flatMap((item, index) => (seen.has(keyOf(item)) ? [index] : []));
  const next = [...full];
  slots.forEach((slot, order) => {
    next[slot] = sequence[order];
  });
  return next.every((item, index) => item === full[index]) ? null : next;
};

/** 서버로 보낼 id 목록 — 중복을 걷고 상한에서 자른다. 어기면 400 이다(4.8) */
export const toQueueOrderPayload = (ids: readonly string[]): string[] =>
  [...new Set(ids)].slice(0, QUEUE_ORDER_MAX_IDS);

/** 기기 저장값 복원(이관용) — 깨졌거나 모양이 다르면 "순서 없음"으로 본다(던지지 않는다) */
export const parseQueueOrder = (raw: string | null): string[] => {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};
