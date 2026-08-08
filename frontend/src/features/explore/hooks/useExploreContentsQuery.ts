import { useInfiniteQuery } from '@tanstack/react-query';

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
  });
