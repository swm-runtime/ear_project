import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { libraryKeys } from '@/features/library';
import { usePlayGate, usePlayLimitStore } from '@/features/player';

import { exploreKeys } from '../api/explore.api';
import { EXPLORE_COPY } from '../explore.copy';
import type {
  ExploreContentsPage,
  ExploreFeed,
  ExploreItem,
  ExploreLibraryState,
} from '../explore.types';
import { useExploreContentsQuery } from './useExploreContentsQuery';
import { useExploreFeedQuery } from './useExploreFeedQuery';
import { useExploreTopicsQuery } from './useExploreTopicsQuery';
import { useSaveContentMutation } from './useSaveContentMutation';
import { useUnsaveContentMutation } from './useUnsaveContentMutation';

type EmptyKind = 'none' | 'feed' | 'filtered';

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
    if (isApiError(contentsError) && contentsError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID) {
      void refetchContents();
    }
  }, [contentsError, refetchContents]);

  /* ── 목록 파생값 ── */
  const sections = useMemo(() => {
    if (!feedData) return [];
    return feedData.sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !hiddenContentIds.has(item.content.id)),
      }))
      .filter((section) => section.items.length > 0);
  }, [feedData, hiddenContentIds]);

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

  /* ── 주제 칩 — 다중 선택 OR. 선택이 생기면 단일 목록, 전부 해제하면 섹션형 복귀 ── */
  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId],
    );
  };

  const clearTopicFilter = () => setSelectedTopicIds([]);

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
    // 잔여 표시·페이월
    remainingDisplay,
    openPaywall: playGate.openPaywall,
    // 재생
    handleRowPress,
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
    // 더보기 시트 — 담기/제거
    moreSheetItem,
    openMoreSheet: setMoreSheetItem,
    closeMoreSheet: () => setMoreSheetItem(null),
    requestSave,
    requestRemove,
    // 빈 상태 액션
    goToLibrary,
  };
};
