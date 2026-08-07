import { useInfiniteQuery } from '@tanstack/react-query';

import { fetchLibraryItems, libraryKeys } from '../api/library.api';
import type { LibraryFilter, LibrarySourceFilter } from '../library.types';

/** 커서 기반 무한 스크롤(library-api.md 4.1). 탭·주제·출처가 바뀌면 키가 바뀌어 첫 페이지부터다 */
export const useLibraryItemsQuery = (
  filter: LibraryFilter,
  topicIds: string[],
  sourceFilter: LibrarySourceFilter | null,
) =>
  useInfiniteQuery({
    queryKey: libraryKeys.items(filter, topicIds, sourceFilter),
    queryFn: ({ pageParam }) =>
      fetchLibraryItems({ filter, topicIds, sourceFilter, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
  });
