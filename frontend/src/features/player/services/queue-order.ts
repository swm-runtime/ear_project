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
