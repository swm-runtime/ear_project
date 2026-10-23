import type { PlaybackSession, PlayQueueContext, QueueEntry } from '../player.types';

/**
 * 재생 목록 맥락(KAN-241)의 순수 계산 — 스냅샷에 지금 듣는 편을 세우고, 추천 줄을 틀면 스냅샷에 더한다.
 * 상태를 바꾸지 않는다 — 호출자가 스토어에 쓴다.
 */

/**
 * 세션 메타로 만든 임시 줄 — 스냅샷에 없는 편(상세 화면을 거쳐 왔거나 카드로 접혀 있던 편)을 맨 위에 세울 때 쓴다. 줄에 드는
 * 필드만 받는다 — 화면이 재생 위치(0.5초마다 바뀐다)와 무관하게 메모해 둘 수 있게(KAN-260)
 */
export const entryFromSession = (
  session: Pick<PlaybackSession, 'contentId' | 'meta' | 'libraryItem' | 'durationSec'>,
): QueueEntry => ({
  itemId: session.libraryItem?.id ?? null,
  contentId: session.contentId,
  title: session.meta.title ?? '',
  authorName: session.meta.authorName,
  sourceName: session.meta.sourceName,
  thumbnailUrl: session.meta.thumbnailUrl,
  durationSec: session.durationSec > 0 ? session.durationSec : null,
  // 세션은 오늘 차감 여부를 모른다 — 지금 듣는 편은 다시 고를 수 없는 줄이라(오조작 무시) 이 값이 쓰이지 않는다
  isCountedToday: true,
  isCompleted: session.libraryItem?.status === 'completed',
  topicIds: session.meta.topicIds,
});

/**
 * 탐색 맥락 패널의 목록 — 스냅샷 순서 그대로, **지금 듣는 편이 없으면 맨 위**(player.md 4.2-1). 담기로 라이브러리에 들어간
 * 편은 스냅샷의 `itemId` 가 채워져 있으니 그대로 둔다
 */
export const withCurrentFirst = (items: QueueEntry[], current: QueueEntry | null): QueueEntry[] => {
  if (current === null || items.some((item) => item.contentId === current.contentId)) return items;
  return [current, ...items];
};

/**
 * 추천 블록("다음에 들어볼 만한")의 줄을 틀었다 — **맥락은 바뀌지 않고** 그 편이 스냅샷에 더해진다(player.md 4.2-2).
 * 자리는 지금 듣는 편 바로 뒤다(이어서 듣는 흐름으로 읽힌다). 이미 있으면 그대로. 라이브러리 맥락은 바뀌지 않는다
 */
export const appendToSnapshot = (
  context: PlayQueueContext,
  item: QueueEntry,
  currentContentId: string | null,
): PlayQueueContext => {
  if (context.kind !== 'explore') return context;
  if (context.items.some((entry) => entry.contentId === item.contentId)) return context;
  const currentIndex = context.items.findIndex((entry) => entry.contentId === currentContentId);
  const at = currentIndex === -1 ? context.items.length : currentIndex + 1;
  return {
    ...context,
    items: [...context.items.slice(0, at), item, ...context.items.slice(at)],
  };
};

/** 줄을 왼쪽으로 밀어 스냅샷에서 뺀다(KAN-241 "3번") — 로컬뿐이다. 라이브러리 맥락은 서버 삭제라 여기서 다루지 않는다 */
export const withoutSnapshotItem = (
  context: PlayQueueContext,
  contentId: string,
): PlayQueueContext => {
  if (context.kind !== 'explore') return context;
  if (!context.items.some((entry) => entry.contentId === contentId)) return context;
  return { ...context, items: context.items.filter((entry) => entry.contentId !== contentId) };
};

/**
 * 줄 손잡이로 스냅샷 순서를 바꾼다(PM 2026-10-23 — 담기 버튼 자리에 손잡이). `ordered` 는 패널이 옮긴 뒤의 목록 **전체**(지금
 * 듣는 편이 맨 위에 세워졌을 수 있다)이고, 그대로 스냅샷이 된다. 인덱스(from·to)가 아니라 결과 순서를 받는다(KAN-254·255) —
 * 연달아 끌면 앞 끌기의 스냅샷이 렌더에 반영되기 전에 다음 끌기가 확정되어, 렌더 시점 목록 기준 인덱스는 다른 줄을 가리켰다.
 * 같은 편이 스냅샷에 있으면 스냅샷의 줄 객체를 쓴다(그사이 담기로 채워진 itemId 를 잃지 않게). 로컬뿐 — 서버 순서와 무관하다
 */
export const withSnapshotOrder = (
  context: PlayQueueContext,
  ordered: readonly QueueEntry[],
): PlayQueueContext => {
  if (context.kind !== 'explore') return context;
  const byContentId = new Map(context.items.map((entry) => [entry.contentId, entry]));
  const items = ordered.map((entry) => byContentId.get(entry.contentId) ?? entry);
  const isSame =
    items.length === context.items.length &&
    items.every((entry, index) => entry === context.items[index]);
  return isSame ? context : { ...context, items };
};

/** 담기 결과를 스냅샷에 반영한다 — `itemId` 가 채워지면 그 줄의 담기 버튼이 사라진다. 실패 복구는 null 로 되돌린다 */
export const withSnapshotItemId = (
  context: PlayQueueContext,
  contentId: string,
  itemId: string | null,
): PlayQueueContext => {
  if (context.kind !== 'explore') return context;
  return {
    ...context,
    items: context.items.map((entry) =>
      entry.contentId === contentId ? { ...entry, itemId } : entry,
    ),
  };
};

/**
 * 담기 결과를 추천 블록("다음에 들어볼 만한")의 장들에 반영한다(KAN-259) — 추천 줄은 스냅샷이 아니라 추천 쿼리(장마다 줄 목록)에서
 * 온다. 그 편이 어느 장에도 없으면 같은 참조를 돌려준다(캐시를 건드리지 않는다)
 */
export const withPagesItemId = (
  pages: QueueEntry[][],
  contentId: string,
  itemId: string | null,
): QueueEntry[][] => {
  let changed = false;
  const next = pages.map((page) => {
    if (!page.some((entry) => entry.contentId === contentId && entry.itemId !== itemId)) {
      return page;
    }
    changed = true;
    return page.map((entry) => (entry.contentId === contentId ? { ...entry, itemId } : entry));
  });
  return changed ? next : pages;
};

/**
 * 자동 재생(연속 재생 — player.md 4.2-4)으로 다음에 틀 편 — 지금 듣는 편 **뒤의 첫 번째 안 들은 편**. 다 들은 편은
 * 건너뛴다(같은 편을 또 틀지 않는다). 지금 듣는 편이 목록에 없거나 뒤에 남은 편이 없으면 null — 거기서 멈춘다
 */
export const nextAutoplayEntry = (
  items: readonly QueueEntry[],
  currentContentId: string,
): QueueEntry | null => {
  const index = items.findIndex((item) => item.contentId === currentContentId);
  if (index === -1) return null;
  return items.slice(index + 1).find((item) => !item.isCompleted) ?? null;
};
