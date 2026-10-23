import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { exploreKeys, fetchExploreSearch } from '../api/explore.api';

/**
 * 키워드 검색(explore-api.md 4.5) — 커서 무한 스크롤. query가 null이면 실행하지 않는다
 * (검색 초기 화면 — 서버 호출 없음).
 *
 * - 질의별로 쿼리 키가 갈려, 연속 입력 중 늦게 도착한 이전 질의 응답이 최신 질의 화면을
 *   덮지 못한다(explore.md 4.5-2 — 키 분리에 의한 구조적 방어).
 * - `exact`(교정 끄기 — KAN-239)도 키에 든다: "혹시 ‘OO’로 검색하고 싶나요?"를 탭하면 같은 질의의 다른 조회라
 *   교정된 결과 캐시를 덮지 않고 새로 받는다.
 * - placeholderData: 질의가 바뀌는 동안 직전 결과를 유지한 채 로딩을 겹친다(explore.md 5장
 *   "검색 중" — 결과를 지우고 스켈레톤으로 갈지 않는다).
 * - gcTime 0: 검색 상태는 화면 이탈과 함께 버린다(explore.md 4.5-1) — 재진입·재검색이
 *   낡은 담김·카운트 캐시로 그려지지 않게 한다.
 */
export const useExploreSearchQuery = (query: string | null, exact = false) =>
  useInfiniteQuery({
    queryKey: exploreKeys.search(query ?? '', exact),
    queryFn: ({ pageParam }) =>
      fetchExploreSearch({ query: query ?? '', cursor: pageParam ?? undefined, exact }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
    enabled: query !== null,
    gcTime: 0,
    placeholderData: keepPreviousData,
  });
