import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { exploreKeys, fetchExploreSearch } from '../api/explore.api';

/**
 * 키워드 검색(explore-api.md 4.5) — 커서 무한 스크롤. query가 null이면 실행하지 않는다
 * (검색 초기 화면 — 서버 호출 없음).
 *
 * - 질의별로 쿼리 키가 갈려, 연속 입력 중 늦게 도착한 이전 질의 응답이 최신 질의 화면을
 *   덮지 못한다(explore.md 4.5-2 — 키 분리에 의한 구조적 방어).
 * - placeholderData: 질의가 바뀌는 동안 직전 결과를 유지한 채 로딩을 겹친다(explore.md 5장
 *   "검색 중" — 결과를 지우고 스켈레톤으로 갈지 않는다).
 * - gcTime 0: 검색 상태는 화면 이탈과 함께 버린다(explore.md 4.5-1) — 재진입·재검색이
 *   낡은 담김·카운트 캐시로 그려지지 않게 한다.
 */
export const useExploreSearchQuery = (query: string | null) =>
  useInfiniteQuery({
    queryKey: exploreKeys.search(query ?? ''),
    queryFn: ({ pageParam }) =>
      fetchExploreSearch({ query: query ?? '', cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
    enabled: query !== null,
    gcTime: 0,
    placeholderData: keepPreviousData,
  });
