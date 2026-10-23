import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { QueueEntry } from '../player.types';
import { getPlayerLibraryBridge } from '../services/player-library.bridge';

export const upNextKeys = {
  all: ['player', 'upNext'] as const,
  of: (contentId: string, excludeIds: string[]) =>
    [...upNextKeys.all, contentId, [...excludeIds].sort().join(',')] as const,
};

/** 다음 장을 받을 때 기준으로 삼아 볼 추천 편 수 — 맨 끝 편의 비슷한 편이 전부 이미 본 편이면 그 앞 편으로 */
const NEXT_SEED_TRIES = 3;

interface UpNextPageParam {
  /** 비슷한 편을 찾을 기준 편 — 첫 장은 지금 듣는 편, 그다음은 앞 장의 끝 편부터 */
  seeds: string[];
  /** 앞 장들에 이미 보인 편(최근 것부터) — 캐시에서 읽지 않는다: 다시 받기(refetch)는 첫 장부터 차례로 돌아 캐시와 어긋난다 */
  shownIds: string[];
}

/**
 * "다음에 들어볼 만한"(player.md 4.2-2, KAN-241) — 재생 목록 아래 추천 블록. **끝이 없다**(PM 2026-10-23 "유튜브 뮤직처럼
 * 재생목록 무한으로") — 첫 장은 지금 듣는 편과 비슷한 편, 끝까지 내리면 **앞 장의 끝 편과 비슷한 편**을 이어 받는다(라디오처럼
 * 흘러간다). 이미 목록·앞 장에 있는 편은 뺀다 — 서버 제외 목록은 50개가 상한이라 받은 뒤 한 번 더 거른다. 기준 편 몇 개를
 * 돌려도 새 편이 없으면 거기가 끝이다. 소스는 브리지가 정한다(related → interest 폴백).
 * **열었을 때만**, 지금 듣는 편이 바뀌면 처음부터 다시 받는다. 같은 편이면 패널을 닫았다 열어도 다시 받지 않는다(staleTime).
 * 실패는 빈 장이다 — 추천은 없어도 되는 블록이라 패널에 오류를 그리지 않는다
 */
export const useUpNextQuery = (
  contentId: string | null,
  excludeIds: string[],
  enabled: boolean,
) => {
  const query = useInfiniteQuery({
    queryKey: upNextKeys.of(contentId ?? '', excludeIds),
    initialPageParam: {
      seeds: contentId === null ? [] : [contentId],
      shownIds: [],
    } as UpNextPageParam,
    queryFn: async ({ pageParam }): Promise<QueueEntry[]> => {
      if (contentId === null) return [];
      const bridge = getPlayerLibraryBridge();
      if (!bridge) return [];
      const { shownIds } = pageParam;
      const seen = new Set([contentId, ...excludeIds, ...shownIds]);
      for (const seed of pageParam.seeds) {
        try {
          const page = await bridge.fetchUpNext(seed, [contentId, ...shownIds, ...excludeIds]);
          const fresh = page.filter((item) => !seen.has(item.contentId));
          if (fresh.length > 0) return fresh;
        } catch {
          // 다음 기준 편으로
        }
      }
      return [];
    },
    getNextPageParam: (lastPage, allPages): UpNextPageParam | undefined => {
      if (lastPage.length === 0) return undefined;
      // 최근에 보인 편부터 — 서버 제외 상한(50)에 잘려도 바로 앞 장과 겹치지 않게
      const shownIds = allPages
        .flat()
        .map((item) => item.contentId)
        .reverse();
      return { seeds: shownIds.slice(0, NEXT_SEED_TRIES), shownIds };
    },
    enabled: enabled && contentId !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  return {
    items,
    isPending: query.isPending,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    fetchMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
};
