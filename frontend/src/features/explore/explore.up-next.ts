import type { QueryClient } from '@tanstack/react-query';

import { logger } from '@/shared/lib/logger';

import type { QueueEntry } from '@/features/player';

import { exploreKeys, fetchExploreFeed, fetchRelatedContents } from './api/explore.api';
import { toQueueEntry } from './explore.queue';
import type { ExploreFeed, ExploreItem } from './explore.types';

/** 추천 블록 길이(player.md 4.2-2 "3~5편") */
const UP_NEXT_LIMIT = 5;
/** 피드 캐시를 새것으로 보는 시간 — 탐색 피드 쿼리(useExploreFeedQuery)와 같은 값 */
const FEED_STALE_MS = 5 * 60 * 1000;

/**
 * "다음에 들어볼 만한"의 폴백 소스(player.md 4.2-2 ②, KAN-241) — 탐색 `interest` 섹션에서 지금 듣는 편·스냅샷을 뺀 앞 5편.
 * 탐색 화면이 받아 둔 피드 캐시를 그대로 쓴다(같은 키·같은 queryFn) — 없거나 낡았으면 그때 한 번 받는다
 */
export const fetchInterestUpNext = async (
  queryClient: QueryClient,
  excludeIds: string[],
): Promise<QueueEntry[]> => {
  const feed = await queryClient.fetchQuery<ExploreFeed>({
    queryKey: exploreKeys.feed(),
    queryFn: fetchExploreFeed,
    staleTime: FEED_STALE_MS,
  });
  const exclude = new Set(excludeIds);
  const interest = feed.sections.find((section) => section.sectionKey === 'interest');
  return (interest?.items ?? [])
    .filter((entry): entry is ExploreItem => entry.type === 'content')
    .filter((entry) => !exclude.has(entry.content.id))
    .slice(0, UP_NEXT_LIMIT)
    .map(toQueueEntry);
};

/**
 * "다음에 들어볼 만한" 두 단계(player.md 4.2-2) — ① 지금 듣는 편과 대본 임베딩이 비슷한 편(`GET /contents/:id/related`, KAN-240)
 * → 비거나 실패(404·네트워크·임베딩 없음)면 ② `interest` 섹션. 두 소스 모두 지금 듣는 편·스냅샷을 뺀다. ①의 실패는 조용히 넘긴다 —
 * 추천은 없어도 되는 블록이다(패널에 오류를 그리지 않는다)
 */
export const fetchUpNext = async (
  queryClient: QueryClient,
  contentId: string,
  excludeIds: string[],
): Promise<QueueEntry[]> => {
  const exclude = [contentId, ...excludeIds];
  try {
    const related = await fetchRelatedContents({
      contentId,
      excludeIds: exclude,
      limit: UP_NEXT_LIMIT,
    });
    if (related.length > 0) return related.map(toQueueEntry);
  } catch (error) {
    logger.debug('[explore] related contents unavailable — interest fallback', error);
  }
  return fetchInterestUpNext(queryClient, exclude);
};
