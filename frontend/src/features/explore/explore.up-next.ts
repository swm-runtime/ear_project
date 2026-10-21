import type { QueryClient } from '@tanstack/react-query';

import type { QueueEntry } from '@/features/player';

import { exploreKeys, fetchExploreFeed } from './api/explore.api';
import { toQueueEntry } from './explore.queue';
import type { ExploreFeed, ExploreItem } from './explore.types';

/** 추천 블록 길이(player.md 4.2-2 "3~5편") */
const UP_NEXT_LIMIT = 5;
/** 피드 캐시를 새것으로 보는 시간 — 탐색 피드 쿼리(useExploreFeedQuery)와 같은 값 */
const FEED_STALE_MS = 5 * 60 * 1000;

/**
 * "다음에 들어볼 만한"의 폴백 소스(player.md 4.2-2 ②, KAN-241) — 탐색 `interest` 섹션에서 지금 듣는 편·스냅샷을 뺀 앞 5편.
 * 탐색 화면이 받아 둔 피드 캐시를 그대로 쓴다(같은 키·같은 queryFn) — 없거나 낡았으면 그때 한 번 받는다.
 * 1차 소스(BE KAN-240 `GET /contents/:id/related`)는 서버가 나오면 bootstrap 브리지가 이 함수 앞에 둔다
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
