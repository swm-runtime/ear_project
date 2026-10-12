import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { exploreKeys, fetchExploreContents } from '../api/explore.api';

/** 주제 필터 단일 목록(explore-api.md 4.2) — 커서 무한 스크롤. 필터가 있을 때만 켠다 */
export const useExploreContentsQuery = (topicIds: string[]) =>
  useInfiniteQuery({
    queryKey: exploreKeys.contents(topicIds),
    queryFn: ({ pageParam }) =>
      fetchExploreContents({ topicIds, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
    enabled: topicIds.length > 0,
    // 주제를 바꾸는 동안 앞 주제의 목록을 그대로 둔다 — 화면은 흐리게 두고 새 목록이 오면 바꾼다(PM 2026-10-09 깜빡임).
    // 자리표시 여부는 isPlaceholderData 로 가린다(useExploreScreen)
    placeholderData: keepPreviousData,
  });
