import { type QueryClient, useInfiniteQuery } from '@tanstack/react-query';

import { fetchLibraryItems, libraryKeys } from '../api/library.api';
import type { LibraryFilter, LibrarySourceFilter } from '../library.types';

/**
 * 스플래시에서 미리 받은 첫 페이지(`prefetchLibraryFirstPage`)를 화면이 뜨자마자 또 받지 않게 하는
 * 짧은 신선 구간. 삭제·담기·포그라운드 복귀의 무효화는 이 값과 무관하게 즉시 다시 받는다.
 */
const FIRST_PAGE_FRESH_MS = 5_000;

const firstPageOptions = (
  filter: LibraryFilter,
  topicIds: string[],
  sourceFilter: LibrarySourceFilter | null,
) => ({
  queryKey: libraryKeys.items(filter, topicIds, sourceFilter),
  queryFn: ({ pageParam }: { pageParam: string | null }) =>
    fetchLibraryItems({ filter, topicIds, sourceFilter, cursor: pageParam ?? undefined }),
  initialPageParam: null as string | null,
  staleTime: FIRST_PAGE_FRESH_MS,
});

/**
 * 라이브러리 첫 화면(전체 탭·필터 없음)의 첫 페이지를 **화면이 뜨기 전에** 받아 둔다 — 스플래시의
 * 로고 모션이 도는 동안이다. 화면과 **같은 키**로 캐시에 넣으므로 라이브러리는 뜨자마자 목록을 그린다.
 * 받은 썸네일 주소를 돌려준다(호출부가 이미지까지 미리 받는다). 실패하면 빈 배열 — 화면이 평소대로 받는다.
 */
export const prefetchLibraryFirstPage = async (queryClient: QueryClient): Promise<string[]> => {
  try {
    const data = await queryClient.fetchInfiniteQuery(firstPageOptions('all', [], null));
    return data.pages.flatMap((page) => page.items.map((item) => item.content.thumbnailUrl ?? ''));
  } catch {
    return [];
  }
};

/** 커서 기반 무한 스크롤(library-api.md 4.1). 탭·주제·출처가 바뀌면 키가 바뀌어 첫 페이지부터다 */
export const useLibraryItemsQuery = (
  filter: LibraryFilter,
  topicIds: string[],
  sourceFilter: LibrarySourceFilter | null,
) =>
  useInfiniteQuery({
    ...firstPageOptions(filter, topicIds, sourceFilter),
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
  });
