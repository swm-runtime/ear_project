import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';

import { exploreKeys, fetchExplorePopular } from '../api/explore.api';
import type { ExplorePeriod } from '../explore.types';

/**
 * 인기 목록 쿼리 옵션(explore-api.md 4.2-1) — 구간 전환의 명령형 선조회(fetchInfiniteQuery)와
 * 화면 구독(useExplorePopularQuery)이 같은 키·같은 queryFn을 쓰기 위한 공용 정의다.
 * 구간별로 키가 갈린다 — 커서가 구간을 넘어 이어지지 않게 하는 구조적 방어다.
 */
export const explorePopularQueryOptions = (period: ExplorePeriod) =>
  infiniteQueryOptions({
    queryKey: exploreKeys.popular(period),
    queryFn: ({ pageParam }) => fetchExplorePopular({ period, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor : null),
    // 전환 성공 직후 구독이 이 키로 옮겨 온다 — 방금 선조회한 데이터를 곧바로 다시 받지 않게 한다.
    // 포그라운드·화면 복귀의 조용한 재조회는 invalidateQueries가 stale로 만들므로 영향이 없다
    staleTime: 30_000,
  });

/**
 * 인기 목록(explore-api.md 4.2-1) — 커서 무한 스크롤. 사용자가 구간을 확정한 뒤에만 켠다
 * (첫 진입의 기본 구간 목록은 피드 응답이 이미 들고 있다 — 이 훅이 부르지 않는다).
 * 전환 중 화면은 직전 확정 구간의 이 캐시를 그대로 유지한다(uiux 4.10).
 */
export const useExplorePopularQuery = (period: ExplorePeriod | null) =>
  useInfiniteQuery({
    // enabled가 꺼져 있어 null 키로는 queryFn이 실행되지 않는다 — 캐스트는 키 구성용이다
    ...explorePopularQueryOptions(period as ExplorePeriod),
    enabled: period !== null,
  });
