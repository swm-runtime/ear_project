import type { QueueEntry } from '../player.types';

/**
 * 재생 목록 패널의 끌어 옮기기·바닥 여백 — 화면(PlayerQueuePanel)에서 떼어 낸 순수 계산(KAN-254·255·262).
 * 상태를 갖지 않는다 — 패널이 ref·state 로 들고 이 함수들로 판정한다.
 */

/** 줄의 키 — 라이브러리 항목 id 가 없는(담기지 않은) 스냅샷 줄은 콘텐츠 id 로 */
export const queueRowKey = (item: QueueEntry): string => item.itemId ?? `content-${item.contentId}`;

/** 두 키 목록이 같은 순서인가 */
export const isSameKeys = (a: readonly string[], b: readonly string[]): boolean =>
  a === b || (a.length === b.length && a.every((key, index) => key === b[index]));

/**
 * 놓은 뒤 부모의 새 순서가 오기 전까지 패널이 먼저 그릴 순서(KAN-254 원인 2) — `items` 를 `keys` 순서로 다시 세운다.
 * 이미 그 순서면 `items` 그대로(같은 배열), 줄 구성이 다르면(삭제·새로 받기) null — 붙잡을 이유가 없다.
 * 줄 객체는 `items` 것을 쓴다(재생 위치 갱신 등으로 새로 만든 객체가 화면에 반영되게)
 */
export const applyKeyOrder = (
  items: readonly QueueEntry[],
  keys: readonly string[],
): readonly QueueEntry[] | null => {
  if (items.length !== keys.length) return null;
  const byKey = new Map(items.map((item) => [queueRowKey(item), item]));
  if (byKey.size !== keys.length) return null;
  let isSame = true;
  const next: QueueEntry[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const item = byKey.get(keys[index]);
    if (item === undefined) return null;
    if (item !== items[index]) isSame = false;
    next.push(item);
  }
  return isSame ? items : next;
};

/**
 * 끌 수 있는 맨 위 칸 — 맨 위에 세운 지금 듣는 편(라이브러리 첫 페이지 밖, KAN-254 원인 5)은 옮길 수 없는 줄이라 그 칸(0번)
 * 위로는 다른 줄도 못 간다. 서버 순서에 없는 줄이라 옮겨도 저장할 자리가 없다
 */
export const minDragIndexOf = (
  items: readonly QueueEntry[],
  pinnedContentId: string | null | undefined,
): number => (pinnedContentId != null && items[0]?.contentId === pinnedContentId ? 1 : 0);

/** 끄는 줄이 지금 가리키는 칸 — 손가락 이동량(px)을 칸으로 반올림하고 목록 범위(맨 위 칸 포함) 안에 묶는다 */
export const hoverIndexOf = (
  from: number,
  offset: number,
  count: number,
  minIndex: number,
  step: number,
): number => Math.max(minIndex, Math.min(count - 1, from + Math.round(offset / step)));

/** 끄는 줄에게 자리를 비켜 주는 이동량(px) — 끄는 줄 자신과 범위 밖 줄은 0 */
export const dragShiftOf = (
  index: number,
  drag: { from: number; hover: number } | null,
  step: number,
): number => {
  if (!drag || index === drag.from) return 0;
  const { from, hover } = drag;
  if (from < hover && index > from && index <= hover) return -step;
  if (hover < from && index >= hover && index < from) return step;
  return 0;
};
