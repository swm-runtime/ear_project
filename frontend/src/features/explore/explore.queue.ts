import type { PlayQueueContext, QueueEntry, QueueSourceLabel } from '@/features/player';

import type { ExploreEntry, ExploreItem } from './explore.types';

/**
 * 탐색 목록 → 재생 목록 스냅샷(KAN-241 — player.md 4.2-1). 탐색이 재생을 시작할 때 "들어온 목록"을 플레이어에
 * 넘기는 변환이다. 시리즈 카드는 편이 아니라 뺀다. `itemId` 는 담긴 편만 있다 — 없는 편에는 패널이 담기 버튼을 붙인다.
 * 순수 변환만 둔다(API 를 부르지 않는다) — 추천 폴백 조회는 `explore.up-next.ts`
 */
export const toQueueEntry = (item: ExploreItem): QueueEntry => ({
  itemId: item.library?.itemId ?? null,
  contentId: item.content.id,
  title: item.content.title,
  authorName: item.content.authorName || null,
  sourceName: item.content.sourceName || null,
  thumbnailUrl: item.content.thumbnailUrl || null,
  durationSec: item.content.durationSec ?? null,
  isCountedToday: item.isCountedToday,
  isCompleted: item.isCompleted,
  topicIds: item.content.topicIds,
  isLocked: item.content.isLocked,
});

export const toQueueSnapshot = (
  entries: ExploreEntry[],
  source: QueueSourceLabel,
): PlayQueueContext => ({
  kind: 'explore',
  source,
  items: entries
    .filter((entry): entry is ExploreItem => entry.type === 'content')
    .map(toQueueEntry),
});
