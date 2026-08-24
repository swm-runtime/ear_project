import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Linking } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { generateId } from '@/shared/lib/generate-id';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { libraryKeys } from '@/features/library';
import { sendSourceLinkClick, usePlayGate, usePlayLimitStore } from '@/features/player';

import { exploreKeys } from '../api/explore.api';
import { EXPLORE_COPY } from '../explore.copy';
import type {
  ExploreContentsPage,
  ExploreFeed,
  ExploreItem,
  ExploreLibraryState,
  ExplorePeriod,
  ExplorePopularPage,
} from '../explore.types';
import { useExploreContentsQuery } from './useExploreContentsQuery';
import { useExploreFeedQuery } from './useExploreFeedQuery';
import { explorePopularQueryOptions, useExplorePopularQuery } from './useExplorePopularQuery';
import { useExploreTopicsQuery } from './useExploreTopicsQuery';
import { useSaveContentMutation } from './useSaveContentMutation';
import { useUnsaveContentMutation } from './useUnsaveContentMutation';

type EmptyKind = 'none' | 'feed' | 'filtered';

/**
 * 탐색 탭 라우트 파람의 로컬 선언 — 원본은 app/navigation/types.ts다(feature는 app을
 * import하지 않는다 — usePlayerScreen·useContentDetailScreen과 같은 패턴).
 * applyTopicId는 검색 빈 결과(E7)의 관련 주제 칩 복귀용이다(explore.md 4.5-3).
 */
type ExploreRouteParams = {
  Explore: { applyTopicId?: string } | undefined;
};

const isNetworkError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT);

export const useExploreScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const applyPlayLimit = usePlayLimitStore((s) => s.applyPlayLimit);
  const storedPlayLimit = usePlayLimitStore((s) => s.playLimit);

  /* ── 필터 상태 — 앱을 종료하면 초기화된다(메모리 보관) ── */
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const isFiltered = selectedTopicIds.length > 0;

  /* ── E7 관련 주제 칩 복귀(explore.md 4.5-3) — 그 주제의 단일 목록(E2)으로 전환한다.
     파라미터 수신은 렌더 중 상태 조정으로 처리하고(effect 내 setState 금지 — lint 규칙),
     effect는 외부 시스템 갱신(파라미터 소거)만 한다. 소거는 재탭 대비다 — 소거되면
     handled도 undefined로 되돌아가, 같은 주제를 다시 받아도 다시 동작한다 ── */
  const route = useRoute<RouteProp<ExploreRouteParams, 'Explore'>>();
  const tabNavigation = useNavigation<NavigationProp<ExploreRouteParams, 'Explore'>>();
  const applyTopicId = route.params?.applyTopicId;
  const [handledApplyTopicId, setHandledApplyTopicId] = useState<string | undefined>(undefined);
  if (applyTopicId !== handledApplyTopicId) {
    setHandledApplyTopicId(applyTopicId);
    if (applyTopicId !== undefined) setSelectedTopicIds([applyTopicId]);
  }
  useEffect(() => {
    if (applyTopicId === undefined) return;
    tabNavigation.setParams({ applyTopicId: undefined });
  }, [applyTopicId, tabNavigation]);

  /* ── 인기 구간 상태(E13) — 화면 상태이지 사용자 상태가 아니다. 서버에 저장하지 않는다(explore.md 4.1-1).
     null이면 사용자가 아직 고르지 않은 상태 — 선택 표시는 피드 응답의 period가 정한다.
     필터(E2) 전환·복귀에도 초기화하지 않는다 — 되돌아온 화면이 조작 이전과 같아야 한다 ── */
  const [activePeriod, setActivePeriod] = useState<ExplorePeriod | null>(null);
  /** 전환 중인 구간 — 값이 있는 동안 토글 중복 탭을 차단하고 직전 목록을 유지한다 */
  const [pendingPeriod, setPendingPeriod] = useState<ExplorePeriod | null>(null);
  /** 전환에 실패한 구간 — 인라인 에러 + [다시 시도]의 대상이다 */
  const [failedPeriod, setFailedPeriod] = useState<ExplorePeriod | null>(null);

  /* ── 화면 로컬 상태 ── */
  const [moreSheetItem, setMoreSheetItem] = useState<ExploreItem | null>(null);
  /** 회수(403)로 화면에서 걷어낸 행 — 서버 재조회 전까지 로컬로 가린다 */
  const [hiddenContentIds, setHiddenContentIds] = useState<ReadonlySet<string>>(new Set());

  /** 콘텐츠별 담기·해제 조작의 단조 증가 순번 — 오래된 응답을 무시한다(explore-api.md 4.3) */
  const seqRef = useRef(new Map<string, number>());
  const nextSeq = (contentId: string): number => {
    const seq = (seqRef.current.get(contentId) ?? 0) + 1;
    seqRef.current.set(contentId, seq);
    return seq;
  };
  const isLatestSeq = (contentId: string, seq: number): boolean =>
    seqRef.current.get(contentId) === seq;

  const feedQuery = useExploreFeedQuery(!isFiltered);
  const contentsQuery = useExploreContentsQuery(selectedTopicIds);
  // 확정된 구간만 구독한다 — 전환 중 목록은 이 캐시(직전 구간)가 유지하고, 새 구간은 선조회로 채운다
  const popularQuery = useExplorePopularQuery(activePeriod);
  const topicsQuery = useExploreTopicsQuery();
  const saveMutation = useSaveContentMutation();
  const unsaveMutation = useUnsaveContentMutation();

  /* ── 낙관 반영 — 진실은 쿼리 캐시 하나다(architecture.md 7.1). 오버레이 상태를 두지 않는다 ── */
  const setCachedLibraryState = useCallback(
    (contentId: string, library: ExploreLibraryState | null) => {
      queryClient.setQueriesData<ExploreFeed>({ queryKey: exploreKeys.feed() }, (old) =>
        old
          ? {
              ...old,
              sections: old.sections.map((section) => ({
                ...section,
                items: section.items.map((item) =>
                  item.content.id === contentId ? { ...item, library } : item,
                ),
              })),
            }
          : old,
      );
      queryClient.setQueriesData<InfiniteData<ExploreContentsPage>>(
        { queryKey: [...exploreKeys.all, 'contents'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.content.id === contentId ? { ...item, library } : item,
                  ),
                })),
              }
            : old,
      );
      queryClient.setQueriesData<InfiniteData<ExplorePopularPage>>(
        { queryKey: [...exploreKeys.all, 'popular'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.content.id === contentId ? { ...item, library } : item,
                  ),
                })),
              }
            : old,
      );
    },
    [queryClient],
  );

  const invalidateLibrary = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
    [queryClient],
  );

  const hideRow = useCallback((contentId: string) => {
    setHiddenContentIds((prev) => new Set(prev).add(contentId));
  }, []);

  /* ── 재생 게이트 — 판정·팝업·페이월은 라이브러리와 한 갈래다(explore.md 4.4) ── */
  const playGate = usePlayGate({
    // 게이트는 진입점의 쿼리 키를 모른다 — 재조회는 콜백 주입으로 이 화면이 맡는다
    onServerStateChanged: () => {
      void queryClient.invalidateQueries({ queryKey: exploreKeys.all });
      invalidateLibrary();
    },
    // 자동 적립(explore-api.md 4.6) — 재생이 실제로 시작됐고 라이브러리에 없을 때만
    onPlayStarted: (result, target) => {
      if (result.libraryItem !== null) return;
      const seq = nextSeq(target.contentId);
      setCachedLibraryState(target.contentId, {
        itemId: `optimistic-${target.contentId}`,
        source: 'save',
        status: 'in_progress',
      });
      saveMutation.mutate(
        { contentId: target.contentId, clientSeq: seq, reason: 'auto_play' },
        {
          onSuccess: () => invalidateLibrary(),
          // 사용자가 시작하지 않은 실패는 알리지 않는다(common-error-handling.md 4.3)
          // TODO(offline-queue): 큐 인프라 도입 시 재전송 대상으로 적재한다(explore-api.md 4.6)
          onError: () => undefined,
        },
      );
    },
  });

  /* ── 잔여 재생 표시값 — 서버 응답으로만 덮어쓴다. 신선도 판정은 store 가드가 한다 ── */
  const feedData = feedQuery.data;
  useEffect(() => {
    if (!feedData) return;
    applyPlayLimit(feedData.playLimit);
  }, [feedData, applyPlayLimit]);

  const contentsPages = contentsQuery.data?.pages;
  useEffect(() => {
    if (!contentsPages || contentsPages.length === 0) return;
    applyPlayLimit(contentsPages[contentsPages.length - 1].playLimit);
  }, [contentsPages, applyPlayLimit]);

  // 인기 목록 응답도 라이브러리·피드와 같은 세 필드를 싣는다 — 새 갱신 시점이 될 뿐 규칙은 같다
  const popularPages = popularQuery.data?.pages;
  useEffect(() => {
    if (!popularPages || popularPages.length === 0) return;
    applyPlayLimit(popularPages[popularPages.length - 1].playLimit);
  }, [popularPages, applyPlayLimit]);

  /* ── 포그라운드·화면 복귀 시 조용한 재조회 — 인디케이터 없음(explore-uiux.md 4.1) ── */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: exploreKeys.all });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  // 플레이어·다른 탭에서 돌아오면 담김·카운트가 바뀌었을 수 있다 — 조용히 최신화한다
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: exploreKeys.all });
    }, [queryClient]),
  );

  /* ── 커서 무효 — 커서를 버리고 첫 페이지부터. 사용자에게 노출하지 않는다(explore-api.md 4.2) ── */
  const { error: contentsError, refetch: refetchContents } = contentsQuery;
  useEffect(() => {
    if (
      isApiError(contentsError) &&
      contentsError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID
    ) {
      void refetchContents();
    }
  }, [contentsError, refetchContents]);

  // 인기 목록도 같은 규칙(explore-api.md 4.2-1). 구간 간 커서 혼입은 구간별 쿼리 키가 구조로 막고,
  // 여기 걸리는 것은 재조회 사이 서버 목록이 바뀐 경우다
  const { error: popularError, refetch: refetchPopular } = popularQuery;
  useEffect(() => {
    if (isApiError(popularError) && popularError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID) {
      void refetchPopular();
    }
  }, [popularError, refetchPopular]);

  /* ── 목록 파생값 ── */
  // 사용자가 구간을 고른 뒤의 인기 목록 — 전환 중에는 placeholder가 직전 구간 목록을 유지한다
  const popularFetchedItems = useMemo(
    () => (popularQuery.data ? popularQuery.data.pages.flatMap((page) => page.items) : null),
    [popularQuery.data],
  );

  const sections = useMemo(() => {
    if (!feedData) return [];
    return feedData.sections
      .map((section) => {
        // 토글 노출·교체 대상 판정은 key가 아니라 period로 한다(explore-api.md 4.1)
        const isPopular = section.period !== null;
        const items =
          isPopular && activePeriod !== null && popularFetchedItems !== null
            ? popularFetchedItems
            : section.items;
        return {
          ...section,
          // 토글 선택 상태 — 전환 중이면 그 구간, 확정했으면 그 구간, 아니면 피드 응답의 period
          period: isPopular ? (pendingPeriod ?? activePeriod ?? section.period) : null,
          items: items.filter((item) => !hiddenContentIds.has(item.content.id)),
        };
      })
      .filter((section) => section.items.length > 0);
  }, [feedData, hiddenContentIds, popularFetchedItems, pendingPeriod, activePeriod]);

  const filteredItems = useMemo(
    () =>
      (contentsPages ?? [])
        .flatMap((page) => page.items)
        .filter((item) => !hiddenContentIds.has(item.content.id)),
    [contentsPages, hiddenContentIds],
  );

  const activeQuery = isFiltered ? contentsQuery : feedQuery;
  const hasData = isFiltered ? contentsQuery.data !== undefined : feedData !== undefined;
  const isInitialLoading = activeQuery.isPending;
  const showSkeleton = useDelayedVisible(isInitialLoading);
  // 캐시 피드를 노출하지 않는다(합의 2026-08-06) — 데이터 없는 실패는 전체 화면 에러 하나다
  const isFullError = activeQuery.isError && !hasData;
  const isFullErrorNetwork = isFullError && isNetworkError(activeQuery.error);

  const emptyKind: EmptyKind = useMemo(() => {
    if (isInitialLoading || isFullError) return 'none';
    // E8은 콘텐츠 풀 0건일 때만 — 서버가 내린 섹션 자체가 비어 있을 때다(explore-uiux.md 4.7)
    if (!isFiltered && feedData && feedData.sections.length === 0) return 'feed';
    if (isFiltered && contentsPages !== undefined && filteredItems.length === 0) return 'filtered';
    return 'none';
  }, [isInitialLoading, isFullError, isFiltered, feedData, contentsPages, filteredItems.length]);

  /* ── 검색창 줄 우측 잔여 재생 표시(explore.md 4.4-1) — 값 없음이면 표시하지 않는다 ── */
  const remainingDisplay = useMemo(() => {
    if (!storedPlayLimit || isFullError || isInitialLoading) return null;
    const { dailyPlayLimit, dailyPlayCount } = storedPlayLimit;
    if (dailyPlayLimit === null || dailyPlayCount === null) return null;
    const remaining = Math.max(0, dailyPlayLimit - dailyPlayCount);
    return { remaining, limit: dailyPlayLimit, isExhausted: remaining === 0 };
  }, [storedPlayLimit, isFullError, isInitialLoading]);

  /** E12 [상세 정보] — 시트를 닫고 상세 화면으로 이동한다(explore-uiux.md 4.4, 합의 2026-08-23).
      뒤로가기로 복귀하며 피드 스크롤 위치는 유지된다 */
  const openDetail = (item: ExploreItem) => {
    setMoreSheetItem(null);
    navigation.navigate('Main', {
      screen: 'ContentDetail',
      params: { contentId: item.content.id, entryPoint: 'explore' },
    });
  };

  /** E12 [원문 보기](FR-12) — 클릭 기록과 브라우저 열기는 서로를 기다리지 않는다(player-api.md 4.5) */
  const openSourceLink = (item: ExploreItem) => {
    const url = item.content.sourceUrl;
    if (!url) return;
    setMoreSheetItem(null);
    sendSourceLinkClick({ contentId: item.content.id, idempotencyKey: generateId() }).catch(
      (clickError) => logger.debug('[explore] source link click record failed', clickError),
    );
    // TODO(인앱 브라우저): architecture.md 9.3 — expo-web-browser 도입 검토. 현재는 플레이어와
    // 같은 Linking 패턴을 쓴다
    Linking.openURL(url).catch((linkError) =>
      logger.warn('[explore] open source link failed', linkError),
    );
  };

  /* ── 담기 · 제거 — 더보기 시트 소유(explore.md 4.3). 낙관 반영 + client_seq 순서 방어 ── */
  const requestSave = (item: ExploreItem) => {
    setMoreSheetItem(null);
    const contentId = item.content.id;
    const previous = item.library;
    const seq = nextSeq(contentId);
    // 배지 즉시 + 토스트 — 담기는 무제한이라 페이월이 없다(PRD 5.4)
    setCachedLibraryState(contentId, {
      itemId: previous?.itemId ?? `optimistic-${contentId}`,
      source: 'save',
      status: previous?.status ?? 'unplayed',
    });
    showToast(EXPLORE_COPY.saveToast, {
      label: EXPLORE_COPY.saveToastAction,
      onPress: () => goToLibrary(),
    });
    saveMutation.mutate(
      { contentId, clientSeq: seq },
      {
        onSuccess: (result) => {
          if (!isLatestSeq(contentId, result.clientSeq)) return;
          invalidateLibrary();
        },
        onError: (error) => {
          if (!isLatestSeq(contentId, seq)) return;
          if (isApiError(error) && error.errorCode === ERROR_CODES.CONTENT_WITHDRAWN) {
            showToast(error.message);
            hideRow(contentId);
            return;
          }
          if (isApiError(error) && error.errorCode === ERROR_CODES.CONTENT_NOT_FOUND) {
            hideRow(contentId);
            return;
          }
          // 낙관 반영 실패 — 원상 복구 + 토스트(common-error-handling.md 4.4)
          setCachedLibraryState(contentId, previous);
          showToast(EXPLORE_COPY.saveFailedToast);
        },
      },
    );
  };

  const requestRemove = (item: ExploreItem) => {
    setMoreSheetItem(null);
    const contentId = item.content.id;
    const previous = item.library;
    const seq = nextSeq(contentId);
    // 제거는 무음 — 배지 소멸이 곧 피드백이다(explore-uiux.md 4.4)
    setCachedLibraryState(contentId, null);
    unsaveMutation.mutate(
      { contentId, clientSeq: seq },
      {
        onSuccess: (result) => {
          if (!isLatestSeq(contentId, result.clientSeq)) return;
          invalidateLibrary();
        },
        onError: () => {
          if (!isLatestSeq(contentId, seq)) return;
          setCachedLibraryState(contentId, previous);
          showToast(EXPLORE_COPY.removeFailedToast);
        },
      },
    );
  };

  /* ── 재생 — 행 본문 탭은 곧장 재생 판정이다(explore-uiux.md 4.1) ── */
  const handleRowPress = (item: ExploreItem) => {
    playGate.requestPlay(
      {
        contentId: item.content.id,
        isCountedToday: item.isCountedToday,
        // 목록이 이미 아는 메타 — 플레이어가 진입과 동시에 그린다(player-uiux.md 4.3)
        meta: {
          title: item.content.title,
          authorName: item.content.authorName,
          sourceName: item.content.sourceName,
          thumbnailUrl: item.content.thumbnailUrl,
          durationSec: item.content.durationSec,
        },
        onWithdrawn: () => hideRow(item.content.id),
      },
      'explore',
    );
  };

  /* ── 새로고침·추가 로딩 ── */
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const refresh = async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        isFiltered ? contentsQuery.refetch() : feedQuery.refetch(),
        topicsQuery.refetch(),
        // 사용자가 고른 구간의 인기 목록도 함께 최신화한다 — 안 골랐으면 피드가 그 섹션을 든다
        ...(activePeriod !== null ? [popularQuery.refetch()] : []),
      ]);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const loadMore = () => {
    if (!isFiltered) return;
    if (!contentsQuery.hasNextPage || contentsQuery.isFetchingNextPage || contentsQuery.isFetching)
      return;
    void contentsQuery.fetchNextPage();
  };

  const isLoadMoreFailed =
    isFiltered &&
    contentsQuery.isFetchNextPageError &&
    !(isApiError(contentsError) && contentsError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID);

  /* ── 인기 구간 토글(E13) — 전환은 그 섹션만 갈아끼우고 피드는 다시 부르지 않는다(explore.md 4.1-1) ── */
  const feedPopularPeriod = useMemo(
    () => feedData?.sections.find((section) => section.period !== null)?.period ?? null,
    [feedData],
  );

  /**
   * 전환은 명령형 선조회다 — 성공해야 구독 구간(activePeriod)을 옮긴다. 실패하면 구독이 직전
   * 구간에 그대로 남아 있으므로 목록·선택 상태의 되돌림이 따로 필요 없다(uiux 4.10).
   */
  const switchPopularPeriod = (period: ExplorePeriod) => {
    setFailedPeriod(null);
    setPendingPeriod(period);
    queryClient
      .fetchInfiniteQuery(explorePopularQueryOptions(period))
      .then((result) => {
        setActivePeriod(period);
        // 전환 완료를 한 번만 알린다 — aria-live polite의 대역(uiux 7)
        const count = result.pages.reduce((sum, page) => sum + page.items.length, 0);
        AccessibilityInfo.announceForAccessibility(
          EXPLORE_COPY.popular.switchedA11y(EXPLORE_COPY.popular.periodLabels[period], count),
        );
      })
      .catch(() => setFailedPeriod(period))
      .finally(() => setPendingPeriod(null));
  };

  const selectPopularPeriod = (period: ExplorePeriod) => {
    if (pendingPeriod !== null) return; // 전환 중 중복 탭 차단(uiux 4.10)
    // 이미 보고 있는 구간이면 아무것도 하지 않는다 — 목록이 그 구간으로 이미 그려져 있다
    if (period === (activePeriod ?? feedPopularPeriod)) {
      setFailedPeriod(null);
      return;
    }
    switchPopularPeriod(period);
  };

  const retryPopularSwitch = () => {
    if (failedPeriod === null || pendingPeriod !== null) return;
    switchPopularPeriod(failedPeriod);
  };

  const loadMorePopular = () => {
    // 구간을 고르기 전에는 커서가 없다 — 피드 섹션 목록은 서버가 정한 개수가 전부다
    if (activePeriod === null || pendingPeriod !== null) return;
    if (!popularQuery.hasNextPage || popularQuery.isFetchingNextPage || popularQuery.isFetching)
      return;
    void popularQuery.fetchNextPage();
  };

  const isPopularLoadMoreFailed =
    popularQuery.isFetchNextPageError &&
    !(isApiError(popularError) && popularError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID);

  /* ── 주제 칩 — 다중 선택 OR. 선택이 생기면 단일 목록, 전부 해제하면 섹션형 복귀 ── */
  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId],
    );
  };

  const clearTopicFilter = () => setSelectedTopicIds([]);

  /** 검색창 탭 → 검색 화면(E6) 전환(explore.md 4.5-1). 피드 상태(필터·구간·스크롤)는 이
      화면이 스택 아래 남아 그대로 유지되고, 검색 상태는 검색 화면이 소유한다(pop = 폐기) */
  const openSearch = () => {
    navigation.navigate('Main', { screen: 'ExploreSearch' });
  };

  const goToLibrary = () => {
    navigation.navigate('Main', { screen: 'Tabs', params: { screen: 'Library' } });
  };

  const retry = () => {
    if (isFiltered) void contentsQuery.refetch();
    else void feedQuery.refetch();
    void topicsQuery.refetch();
  };

  return {
    // 모드·목록
    isFiltered,
    sections,
    filteredItems,
    emptyKind,
    // 주제 칩
    topics: topicsQuery.data ?? [],
    selectedTopicIds,
    toggleTopic,
    clearTopicFilter,
    // 로딩·오류
    showSkeleton,
    isInitialLoading,
    isFullError,
    isFullErrorNetwork,
    isRetrying: activeQuery.isRefetching,
    retry,
    isManualRefreshing,
    refresh,
    loadMore,
    isFetchingNextPage: contentsQuery.isFetchingNextPage,
    isLoadMoreFailed,
    retryLoadMore: () => void contentsQuery.fetchNextPage(),
    // 인기 구간 토글(E13)
    selectPopularPeriod,
    isPopularSwitching: pendingPeriod !== null,
    isPopularSwitchFailed: failedPeriod !== null,
    retryPopularSwitch,
    loadMorePopular,
    isFetchingPopularNextPage: popularQuery.isFetchingNextPage,
    isPopularLoadMoreFailed,
    retryPopularLoadMore: () => void popularQuery.fetchNextPage(),
    // 검색 진입(E6)
    openSearch,
    // 잔여 표시·페이월
    remainingDisplay,
    openPaywall: playGate.openPaywall,
    // 재생
    handleRowPress,
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
    // 더보기 시트 — 상세 정보·원문 보기·담기/제거
    moreSheetItem,
    openMoreSheet: setMoreSheetItem,
    closeMoreSheet: () => setMoreSheetItem(null),
    openDetail,
    openSourceLink,
    requestSave,
    requestRemove,
    // 빈 상태 액션
    goToLibrary,
  };
};
