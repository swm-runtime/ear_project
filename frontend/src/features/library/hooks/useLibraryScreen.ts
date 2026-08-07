import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useToastStore } from '@/shared/ui/toast.store';

import { hydrateSuppressedServiceDate, usePlayGate, usePlayLimitStore } from '@/features/player';

import { libraryKeys } from '../api/library.api';
import { DELETE_UNDO_DURATION_MS } from '../library.constants';
import { LIBRARY_COPY } from '../library.copy';
import type {
  LibraryFilter,
  LibraryItem,
  LibrarySourceFilter,
  LibraryTopic,
} from '../library.types';
import { useDeleteLibraryItemMutation } from './useDeleteLibraryItemMutation';
import { useLibraryItemsQuery } from './useLibraryItemsQuery';
import { useLibraryTopicsQuery } from './useLibraryTopicsQuery';
import { useResumeTargetQuery } from './useResumeTargetQuery';

/** 적용 시점의 주제 이름을 함께 보관한다 — L7 보조 문구에 걸린 조건을 그대로 적기 위해(uiux 4.8) */
interface AppliedTopicFilter {
  ids: string[];
  names: string[];
}

type EmptyKind = 'none' | 'newUser' | 'filtered' | 'drip' | 'deletedAll';

const EMPTY_TOPIC_FILTER: AppliedTopicFilter = { ids: [], names: [] };

const isNetworkError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT);

export const useLibraryScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const applyPlayLimit = usePlayLimitStore((s) => s.applyPlayLimit);
  const storedPlayLimit = usePlayLimitStore((s) => s.playLimit);

  /* ── 필터 상태 — 앱을 종료하면 초기화된다(메모리 보관, library.md 7) ── */
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [topicFilter, setTopicFilter] = useState<AppliedTopicFilter>(EMPTY_TOPIC_FILTER);
  /** 출처 필터(이어 PICK/담은 콘텐츠) — 카드 배지를 대체한다(FE 개편 2026-08-07) */
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter | null>(null);
  const [isTopicSheetVisible, setIsTopicSheetVisible] = useState(false);
  /** 시트를 열 때마다 올려 재마운트시킨다 — 폐기된 초안이 다음 열림에 남지 않게 */
  const [topicSheetEpoch, setTopicSheetEpoch] = useState(0);

  /* ── 시트·삭제·미니플레이어 로컬 상태 ── */
  const [moreSheetItem, setMoreSheetItem] = useState<LibraryItem | null>(null);
  const [hiddenItemIds, setHiddenItemIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingDeleteItem, setPendingDeleteItem] = useState<LibraryItem | null>(null);
  const [hasDeletedInSession, setHasDeletedInSession] = useState(false);
  const [dismissedResumeIds, setDismissedResumeIds] = useState<ReadonlySet<string>>(new Set());
  const [newArrivalCount, setNewArrivalCount] = useState(0);

  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeleteRef = useRef<LibraryItem | null>(null);
  const lastTopAddedAtRef = useRef<string | null>(null);

  const itemsQuery = useLibraryItemsQuery(filter, topicFilter.ids, sourceFilter);
  const resumeQuery = useResumeTargetQuery();
  const topicsQuery = useLibraryTopicsQuery(isTopicSheetVisible);
  const deleteMutation = useDeleteLibraryItemMutation();
  // 게이트는 라이브러리의 쿼리 키를 모른다 — 재조회는 콜백 주입으로 이 화면이 맡는다(architecture.md 4.3)
  const playGate = usePlayGate({
    onServerStateChanged: () => void queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
  });

  const pages = itemsQuery.data?.pages;
  const { error: itemsError, refetch: refetchItems } = itemsQuery;

  /* ── 억제 날짜 복원 — 기기 로컬 값(library.md 4.3) ── */
  useEffect(() => {
    void hydrateSuppressedServiceDate();
  }, []);

  /* ── 잔여 재생 표시값 — 서버 응답으로만 덮어쓴다(library.md 4.1-2) ── */
  useEffect(() => {
    if (!pages || pages.length === 0) return;
    applyPlayLimit(pages[pages.length - 1].playLimit);
  }, [pages, applyPlayLimit]);

  const resumeData = resumeQuery.data;
  useEffect(() => {
    if (!resumeData) return;
    applyPlayLimit(resumeData.playLimit);
  }, [resumeData, applyPlayLimit]);

  /* ── "새 콘텐츠 N개 도착" — 서버가 아니라 클라이언트가 직전 조회와 비교한다(library-api.md 4.1) ── */
  useEffect(() => {
    const firstPage = pages?.[0];
    const top = firstPage?.items[0]?.addedAt ?? null;
    if (top === null || !firstPage) return;
    const prev = lastTopAddedAtRef.current;
    if (prev !== null && top > prev) {
      setNewArrivalCount(firstPage.items.filter((item) => item.addedAt > prev).length);
    }
    lastTopAddedAtRef.current = top;
  }, [pages]);

  /* ── 포그라운드 복귀 시 조용한 재조회 — 인디케이터 없음(library.md 4.6) ── */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  /* ── 커서 무효 — 커서를 버리고 첫 페이지부터. 사용자에게 노출하지 않는다(library-api.md 5장) ── */
  useEffect(() => {
    if (isApiError(itemsError) && itemsError.errorCode === ERROR_CODES.LIBRARY_CURSOR_INVALID) {
      void refetchItems();
    }
  }, [itemsError, refetchItems]);

  /* ── 목록 파생값 ── */
  const items = useMemo(
    () => (pages ?? []).flatMap((page) => page.items).filter((item) => !hiddenItemIds.has(item.id)),
    [pages, hiddenItemIds],
  );
  const hasData = pages !== undefined;

  const isOffline = itemsQuery.isError && hasData && isNetworkError(itemsError);
  const isFullError = itemsQuery.isError && !hasData;
  const isInitialLoading = itemsQuery.isPending;
  const showSkeleton = useDelayedVisible(isInitialLoading);

  const hasActiveFilter = filter !== 'all' || topicFilter.ids.length > 0 || sourceFilter !== null;

  const emptyKind: EmptyKind = useMemo(() => {
    if (isInitialLoading || isFullError || items.length > 0) return 'none';
    // 이어 PICK만 걸린 빈 상태는 L8 — 다음 행동 버튼이 없는 전용 문구를 쓴다(uiux 4.8)
    if (sourceFilter === 'drip' && filter === 'all' && topicFilter.ids.length === 0) return 'drip';
    if (hasActiveFilter) return 'filtered';
    return hasDeletedInSession ? 'deletedAll' : 'newUser';
  }, [
    isInitialLoading,
    isFullError,
    items.length,
    filter,
    sourceFilter,
    topicFilter.ids.length,
    hasActiveFilter,
    hasDeletedInSession,
  ]);

  /** L7 보조 문구 — 걸린 조건을 그대로 적는다 */
  const filteredConditions = useMemo(() => {
    const conditions: string[] = [];
    if (filter !== 'all') conditions.push(LIBRARY_COPY.tab[filter]);
    if (sourceFilter !== null) conditions.push(LIBRARY_COPY.sourceFilter[sourceFilter]);
    conditions.push(...topicFilter.names);
    return conditions;
  }, [filter, sourceFilter, topicFilter.names]);

  /* ── 앱바 잔여 재생 표시(library-uiux.md 4.3) — 캐시·값 없음이면 표시하지 않는다 ── */
  const remainingDisplay = useMemo(() => {
    if (!storedPlayLimit || isOffline || isFullError || isInitialLoading) return null;
    const { dailyPlayLimit, dailyPlayCount } = storedPlayLimit;
    if (dailyPlayLimit === null || dailyPlayCount === null) return null;
    const remaining = Math.max(0, dailyPlayLimit - dailyPlayCount);
    return { remaining, limit: dailyPlayLimit, isExhausted: remaining === 0 };
  }, [storedPlayLimit, isOffline, isFullError, isInitialLoading]);

  /* ── 상단 배너 — 한 번에 하나, 오프라인 > 드립 준비 중 > 새 콘텐츠 도착(uiux 4.1).
        드립 준비 중 배너는 서버 계약에 판정 신호가 없어 보류(미결 — 최종 보고 참조) ── */
  const banner = useMemo(() => {
    if (isOffline) return { type: 'offline' as const };
    if (newArrivalCount > 0) return { type: 'newArrivals' as const, count: newArrivalCount };
    return null;
  }, [isOffline, newArrivalCount]);

  /* ── 삭제 · 실행 취소(library-uiux.md 4.7) ── */
  useEffect(() => {
    pendingDeleteRef.current = pendingDeleteItem;
  }, [pendingDeleteItem]);

  const unhideItem = useCallback((itemId: string) => {
    setHiddenItemIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const commitDelete = useCallback(
    (item: LibraryItem) => {
      deleteMutation.mutate(
        { itemId: item.id },
        {
          onSuccess: () => void queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
          onError: () => {
            // 낙관 반영 실패 — 원상 복구 + 토스트. 조용히 되돌리지 않는다(uiux 5장)
            unhideItem(item.id);
            showToast(LIBRARY_COPY.deleteSnackbar.failedToast);
          },
        },
      );
    },
    [deleteMutation, queryClient, showToast, unhideItem],
  );

  // 화면 이탈 시 대기 중 삭제를 즉시 확정한다 — 놓치면 서버와 로컬이 어긋난다
  const commitDeleteRef = useRef(commitDelete);
  useEffect(() => {
    commitDeleteRef.current = commitDelete;
  }, [commitDelete]);
  useEffect(
    () => () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      if (pendingDeleteRef.current) commitDeleteRef.current(pendingDeleteRef.current);
    },
    [],
  );

  const dismissResume = useCallback((resumeId: string) => {
    setDismissedResumeIds((prev) => new Set(prev).add(resumeId));
  }, []);

  const resumeTarget = resumeData?.resumeTarget ?? null;
  const visibleResumeTarget =
    resumeTarget && !dismissedResumeIds.has(resumeTarget.id) && !hiddenItemIds.has(resumeTarget.id)
      ? resumeTarget
      : null;

  const requestDelete = (item: LibraryItem) => {
    setMoreSheetItem(null);
    // 연속 삭제 — 이전 스낵바를 교체하고 이전 삭제를 즉시 확정한다(uiux 4.7)
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    if (pendingDeleteRef.current) commitDelete(pendingDeleteRef.current);

    setHiddenItemIds((prev) => new Set(prev).add(item.id));
    // 미니플레이어에 뜬 콘텐츠를 삭제하면 미니플레이어를 내린다(library.md 7)
    if (resumeTarget && resumeTarget.id === item.id) dismissResume(item.id);
    setPendingDeleteItem(item);
    setHasDeletedInSession(true);

    // 서버 요청은 스낵바가 사라진 뒤에 보낸다(common-error-handling.md 4.4)
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      setPendingDeleteItem(null);
      commitDelete(item);
    }, DELETE_UNDO_DURATION_MS);
  };

  /** 스낵바가 떠 있는 동안은 서버 호출이 없었다 — 로컬 복구뿐이다(library-api.md 6장) */
  const undoDelete = () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    unhideItem(pending.id);
    setPendingDeleteItem(null);
  };

  /* ── 재생 진입점 — 카드·미니플레이어가 같은 게이트를 거친다(library.md 4.2) ── */
  const handleItemPress = (item: LibraryItem) => {
    // 오프라인에서는 재생 판정으로 가지 않는다 — 판정 자체가 서버 왕복이다(uiux 4.10)
    if (isOffline) {
      showToast(LIBRARY_COPY.error.offlinePlayToast);
      return;
    }
    playGate.requestPlay(
      { contentId: item.content.id, isCountedToday: item.isCountedToday },
      'library',
    );
  };

  const handleMiniPlayerPlay = () => {
    if (!visibleResumeTarget) return;
    if (isOffline) {
      showToast(LIBRARY_COPY.error.offlinePlayToast);
      return;
    }
    const target = visibleResumeTarget;
    playGate.requestPlay(
      {
        contentId: target.content.id,
        isCountedToday: target.isCountedToday,
        // 회수된 콘텐츠면 미니플레이어를 내리고 같은 안내를 띄운다(uiux 4.11)
        onWithdrawn: () => dismissResume(target.id),
      },
      'miniplayer',
    );
  };

  const handleMiniPlayerExpand = () => {
    if (!visibleResumeTarget) return;
    navigation.navigate('Main', {
      screen: 'Player',
      params: { contentId: visibleResumeTarget.content.id },
    });
  };

  /* ── 새로고침·추가 로딩 ── */
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const refresh = async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([itemsQuery.refetch(), resumeQuery.refetch()]);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const loadMore = () => {
    if (!itemsQuery.hasNextPage || itemsQuery.isFetchingNextPage || itemsQuery.isFetching) return;
    void itemsQuery.fetchNextPage();
  };

  const isLoadMoreFailed =
    itemsQuery.isFetchNextPageError &&
    !(isApiError(itemsError) && itemsError.errorCode === ERROR_CODES.LIBRARY_CURSOR_INVALID);

  /* ── 필터 조작 — 조건이 바뀌면 도착 비교 기준도 함께 버린다(다른 조건의 목록과 비교하지 않는다) ── */
  const resetArrivalTracking = () => {
    lastTopAddedAtRef.current = null;
    setNewArrivalCount(0);
  };

  const changeFilter = (next: LibraryFilter) => {
    resetArrivalTracking();
    setFilter(next);
  };

  const applyTopicFilter = (selected: LibraryTopic[], source: LibrarySourceFilter | null) => {
    resetArrivalTracking();
    setTopicFilter({ ids: selected.map((t) => t.id), names: selected.map((t) => t.name) });
    setSourceFilter(source);
    setIsTopicSheetVisible(false);
  };

  const resetFilters = () => {
    resetArrivalTracking();
    setFilter('all');
    setTopicFilter(EMPTY_TOPIC_FILTER);
    setSourceFilter(null);
  };

  const handleBannerPress = () => {
    if (banner?.type !== 'newArrivals') return;
    // 탭·주제 필터는 유지한 채 목록만 최신으로 갱신한다(uiux 4.1)
    setNewArrivalCount(0);
    void refresh();
  };

  const goToExplore = () => {
    navigation.navigate('Main', { screen: 'Tabs', params: { screen: 'Explore' } });
  };

  return {
    // 목록
    items,
    filter,
    setFilter: changeFilter,
    emptyKind,
    filteredConditions,
    resetFilters,
    goToExplore,
    // 로딩·오류
    showSkeleton,
    isInitialLoading,
    isFullError,
    isFullErrorNetwork: isFullError && isNetworkError(itemsError),
    isRefetching: itemsQuery.isRefetching,
    retry: () => void refetchItems(),
    isOffline,
    isManualRefreshing,
    refresh,
    loadMore,
    isFetchingNextPage: itemsQuery.isFetchingNextPage,
    isLoadMoreFailed,
    retryLoadMore: () => void itemsQuery.fetchNextPage(),
    // 앱바·배너
    remainingDisplay,
    banner,
    handleBannerPress,
    openPaywall: playGate.openPaywall,
    // 필터 팝업(출처 + 주제) — 배지는 두 축의 선택 개수 합이다
    topicFilterCount: topicFilter.ids.length + (sourceFilter !== null ? 1 : 0),
    appliedTopicIds: topicFilter.ids,
    appliedSourceFilter: sourceFilter,
    isTopicSheetVisible,
    topicSheetEpoch,
    openTopicSheet: () => {
      setTopicSheetEpoch((epoch) => epoch + 1);
      setIsTopicSheetVisible(true);
    },
    closeTopicSheet: () => setIsTopicSheetVisible(false),
    topics: topicsQuery.data ?? [],
    isTopicsLoading: topicsQuery.isPending,
    applyTopicFilter,
    // 재생
    handleItemPress,
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
    // 미니플레이어
    resumeTarget: visibleResumeTarget,
    handleMiniPlayerPlay,
    handleMiniPlayerExpand,
    // 더보기·삭제
    moreSheetItem,
    openMoreSheet: setMoreSheetItem,
    closeMoreSheet: () => setMoreSheetItem(null),
    requestDelete,
    pendingDeleteItem,
    undoDelete,
  };
};
