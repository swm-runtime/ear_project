import type { PlaybackSession, PlayQueueContext, QueueEntry } from '../player.types';

/**
 * 재생 목록 맥락(KAN-241)의 순수 계산 — 스냅샷에 지금 듣는 편을 세우고, 추천 줄을 틀면 스냅샷에 더한다.
 * 상태를 바꾸지 않는다 — 호출자가 스토어에 쓴다.
 */

/** 세션 메타로 만든 임시 줄 — 스냅샷에 없는 편(상세 화면을 거쳐 왔거나 카드로 접혀 있던 편)을 맨 위에 세울 때 쓴다 */
export const entryFromSession = (session: PlaybackSession): QueueEntry => ({
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
