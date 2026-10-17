import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

import type { ExploreTabParams } from '@/shared/navigation/to-tab';

/**
 * 질의를 넘겨 검색을 여는 요청(KAN-219 — 태그 탭 → `#태그` 즉시 검색). id 는 요청마다 바뀌는 값이다 —
 * 같은 태그를 두 번 눌러도 다시 검색하게, 검색 화면은 id 가 바뀔 때만 질의를 받아들인다
 */
export interface ExploreSearchRequest {
  query: string;
  id: number | string;
}

/** 탐색 탭 라우트 파람의 로컬 선언 — 원본은 app/navigation/types.ts 다(feature 는 app 을 import 하지 않는다) */
type ExploreRouteParams = {
  Explore: ExploreTabParams | undefined;
};

/**
 * 탐색 탭에서 "질의를 넘겨 검색을 연다"의 단일 경로(KAN-219, explore.md 4.5-1).
 *
 * - 다른 화면(콘텐츠 상세 헤더)은 `toTab('Explore', { searchQuery })` 로 탭 파라미터를 넘긴다 — 이 훅이 받아 처리하고
 *   파라미터를 소거한다(applyTopicId 와 같은 패턴. 소거해야 같은 태그를 다시 받아도 다시 동작한다).
 * - 같은 화면 안(인기 대표 카드의 태그)은 `requestSearch(query)` 를 부른다.
 * - **제자리 검색 갈래**(iOS 26·Android — `isInline`)는 `request` 를 내놓고 화면이 그것으로 검색 덮개를 연다.
 *   **스택 검색 갈래**(그 외)는 검색 화면(`ExploreSearch`)을 `initialQuery` 와 함께 연다.
 *
 * 피드 상태(필터·구간·스크롤)는 건드리지 않는다 — 검색은 피드 위에 덮이거나 스택 위에 쌓인다(4.5-1).
 */
export const useExploreSearchRequest = ({ isInline }: { isInline: boolean }) => {
  const navigation = useNavigation();
  const tabNavigation = useNavigation<NavigationProp<ExploreRouteParams, 'Explore'>>();
  const route = useRoute<RouteProp<ExploreRouteParams, 'Explore'>>();

  const [request, setRequest] = useState<ExploreSearchRequest | null>(null);
  /** 제자리 검색 요청 — 요청마다 id 를 올린다(이전 요청이 없으면 1부터) */
  const pushInlineRequest = useCallback((query: string) => {
    setRequest((prev) => ({ query, id: (typeof prev?.id === 'number' ? prev.id : 0) + 1 }));
  }, []);

  /* 파라미터 수신 — 렌더 중 상태 조정(effect 내 setState 금지 — lint 규칙). 이동·소거는 effect(외부 시스템)가 한다 */
  const searchQueryParam = route.params?.searchQuery;
  const [handledParam, setHandledParam] = useState<string | undefined>(undefined);
  if (searchQueryParam !== handledParam) {
    setHandledParam(searchQueryParam);
    if (searchQueryParam !== undefined && isInline) pushInlineRequest(searchQueryParam);
  }
  /* 내비게이션 파라미터와 동기화 — 받은 질의를 소거하고, 스택 갈래면 검색 화면을 연다 */
  useEffect(() => {
    if (searchQueryParam === undefined) return;
    tabNavigation.setParams({ searchQuery: undefined });
    if (!isInline) {
      navigation.navigate('Main', {
        screen: 'ExploreSearch',
        params: { initialQuery: searchQueryParam },
      });
    }
  }, [searchQueryParam, isInline, navigation, tabNavigation]);

  /** 같은 화면 안에서 질의를 넘겨 검색을 연다(인기 대표 카드의 태그 탭) */
  const requestSearch = (query: string) => {
    if (isInline) {
      pushInlineRequest(query);
      return;
    }
    navigation.navigate('Main', { screen: 'ExploreSearch', params: { initialQuery: query } });
  };

  return { request, requestSearch };
};
