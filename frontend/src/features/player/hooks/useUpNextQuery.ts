import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { QueueEntry } from '../player.types';
import { getPlayerLibraryBridge } from '../services/player-library.bridge';

/*
 * 키는 **지금 듣는 편만**이다(KAN-260 — 종전엔 제외 목록도 키에 있었다). 위 목록에서 줄 하나를 지우거나 담으면 제외 목록이 바뀌어
 * 키가 바뀌고, 받아 둔 추천 장들을 버리고 처음부터 다시 받았다(스크롤하던 자리도 사라졌다). 제외는 받을 때 서버에 넘기고(그때의
 * 목록), 받은 뒤에는 아래 `items` 에서 지금 목록으로 한 번 더 거른다
 */
export const upNextKeys = {
  all: ['player', 'upNext'] as const,
  of: (contentId: string) => [...upNextKeys.all, contentId] as const,
};

/** 다음 장을 받을 때 기준으로 삼아 볼 추천 편 수 — 맨 끝 편의 비슷한 편이 전부 이미 본 편이면 그 앞 편으로 */
const NEXT_SEED_TRIES = 3;
/**
 * 추천 편 상한(KAN-260, player.md 4.2-2) — 이만큼 받으면 더 잇지 않는다. 끝없이 붙이면 줄 수에 비례해 목록 렌더·마운트가 무거워져
 * 플레이어가 멈췄다. 한 장 10편 기준 다섯 장 — 듣다 보면 지금 듣는 편이 바뀌어 처음부터 새로 받는다
 */
export const UP_NEXT_MAX_ITEMS = 50;

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
 * 돌려도 새 편이 없으면 거기가 끝이다. **모두 50편(UP_NEXT_MAX_ITEMS)에서 멈춘다**(KAN-260). 소스는 브리지가 정한다(related → interest 폴백).
 * **열었을 때만**, 지금 듣는 편이 바뀌면 처음부터 다시 받는다. 같은 편이면 패널을 닫았다 열어도 다시 받지 않는다(staleTime).
 * 실패는 빈 장이다 — 추천은 없어도 되는 블록이라 패널에 오류를 그리지 않는다
 */
export const useUpNextQuery = (
  contentId: string | null,
  excludeIds: string[],
  enabled: boolean,
) => {
  const query = useInfiniteQuery({
    queryKey: upNextKeys.of(contentId ?? ''),
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
      const shown = allPages.flat();
      // 상한에 닿았다 — 거기가 끝이다(아래 UP_NEXT_MAX_ITEMS)
      if (shown.length >= UP_NEXT_MAX_ITEMS) return undefined;
      // 최근에 보인 편부터 — 서버 제외 상한(50)에 잘려도 바로 앞 장과 겹치지 않게
      const shownIds = shown.map((item) => item.contentId).reverse();
      return { seeds: shownIds.slice(0, NEXT_SEED_TRIES), shownIds };
    },
    enabled: enabled && contentId !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
    /*
     * 지금 듣는 편이 바뀌어(자동 재생) 새로 받는 동안 **앞 편의 추천을 그대로 둔다**(PM 2026-10-23 "자동 재생할 때 재생 목록이
     * 넘어가는 것도 자연스럽게") — 종전엔 키가 바뀌는 순간 섹션이 스켈레톤으로 비었다가 새 추천으로 통째 바뀌었다. 앞 편 추천 중
     * 이제 목록에 든 편·지금 듣는 편은 아래에서 거른다
     */
    placeholderData: keepPreviousData,
  });
  const isPlaceholder = query.isPlaceholderData;
  /*
   * 지금 듣는 편·지금 목록에 있는 편은 늘 거른다 — 키에 제외 목록이 없어(위 upNextKeys) 받은 뒤 목록에 들어온 편(담기·앞 편 추천을
   * 잠시 보여 주는 중)이 남을 수 있다. 위 목록에서 지운 편은 받을 때 이미 빠졌으니 다시 나타나지 않는다. 같은 값이면 같은 배열 —
   * 패널 memo 가 깨지지 않게(KAN-260)
   */
  const excludeKey = excludeIds.join(',');
  const items = useMemo(() => {
    const pages = query.data?.pages.flat() ?? [];
    const hidden = new Set([contentId, ...excludeKey.split(',')]);
    return pages.filter((item) => !hidden.has(item.contentId));
  }, [query.data, contentId, excludeKey]);
  /*
   * 다음 장 받기 — **늘 같은 함수**다(KAN-260 원인 2). 종전엔 렌더마다 새 함수라 패널의 바닥 판정이 렌더(재생 위치 0.5초)마다 다시
   * 돌아, 바닥 근처에 손을 떼고 있어도 장이 스스로 계속 붙었다. 판정에 쓰는 값은 ref 로 읽는다
   */
  const latestRef = useRef({ query, isPlaceholder });
  useEffect(() => {
    latestRef.current = { query, isPlaceholder };
  });
  const fetchMore = useCallback(() => {
    const { query: current, isPlaceholder: isShowingPrevious } = latestRef.current;
    // 앞 편 추천을 잠시 보여 주는 중엔 이어 받지 않는다 — 새 편의 첫 장이 오면 그때부터
    if (!isShowingPrevious && current.hasNextPage && !current.isFetchingNextPage)
      void current.fetchNextPage();
  }, []);
  return {
    items,
    isPending: query.isPending,
    /** 첫 장을 실제로 받는 중(pending && fetching) — 꺼진 쿼리는 false */
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    fetchMore,
  };
};
