import { useNavigation } from '@react-navigation/native';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Linking } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { generateId } from '@/shared/lib/generate-id';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { libraryKeys } from '@/features/library';
import { sendSourceLinkClick, usePlayGate } from '@/features/player';

import { exploreKeys } from '../api/explore.api';
import { EXPLORE_COPY } from '../explore.copy';
import { isSearchableQuery, toSearchQuery } from '../explore.search-query';
import type { ExploreItem, ExploreLibraryState, ExploreSearchPage } from '../explore.types';
import { useExploreSearchQuery } from './useExploreSearchQuery';
import { useExploreTopicsQuery } from './useExploreTopicsQuery';
import { useSaveContentMutation } from './useSaveContentMutation';
import { useUnsaveContentMutation } from './useUnsaveContentMutation';
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  removeRecentSearch,
} from '../services/recent-searches.service';

/** 2자 이상 입력의 자동 검색 지연(explore.md 4.5-2). [검색] 제출·키워드 탭은 기다리지 않는다 */
const SEARCH_DEBOUNCE_MS = 300;

const isNetworkError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT);

/**
 * 검색 화면(E6·E7) ViewModel — 검색 상태는 전부 이 훅(=화면)이 들고, 화면 pop과 함께
 * 버려진다(explore.md 4.5-1). 피드 상태는 스택 아래 탐색 화면이 그대로 유지한다.
 * 결과 행의 재생·담기/제거·상세·원문 보기는 피드와 같은 계약·같은 규칙이다(explore.md 4.5-3).
 */
export const useExploreSearchScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  /* ── 질의 상태 — inputText는 입력 그대로, activeQuery는 실행된 질의(트림본)다 ── */
  const [inputText, setInputText] = useState('');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  /* ── 최근 검색어 — 기기 로컬 10건. 저장 시점은 "사용자 행동으로 이어진 때"뿐이다(4.5-4) ── */
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    void loadRecentSearches().then(setRecentSearches);
  }, []);

  const saveRecent = useCallback((query: string) => {
    void addRecentSearch(query).then(setRecentSearches);
  }, []);

  /** 결과 행 탭(재생·더보기)도 저장 시점이다(explore.md 4.5-4) — 디바운스 검색어가 행동으로 이어졌다 */
  const saveActiveQueryAsRecent = useCallback(() => {
    if (activeQuery !== null) saveRecent(activeQuery);
  }, [activeQuery, saveRecent]);

  const deleteRecentSearch = (query: string) => {
    void removeRecentSearch(query).then(setRecentSearches);
  };
  const clearAllRecentSearches = () => {
    void clearRecentSearches().then(setRecentSearches);
  };

  /* ── 질의 입력·실행 ── */
  const handleChangeText = (text: string) => {
    setInputText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // 실행할 수 없는 입력(2자 미만·특수문자만)이면 검색을 내리고 초기 상태로 돌아간다(4.5-2)
    if (!isSearchableQuery(text)) {
      setActiveQuery(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setActiveQuery(toSearchQuery(text));
    }, SEARCH_DEBOUNCE_MS);
  };

  /** 즉시 실행 경로 공통 — 디바운스를 기다리지 않고, 최근 검색어에 저장한다(4.5-2·4.5-4) */
  const runSearchNow = (raw: string) => {
    if (!isSearchableQuery(raw)) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = toSearchQuery(raw);
    setActiveQuery(query);
    saveRecent(query);
  };

  /** 키보드 [검색] 제출 */
  const submitSearch = () => runSearchNow(inputText);

  /** 추천 키워드 탭 — 그 이름을 질의로 즉시 검색한다. 주제 필터 적용이 아니다(explore.md 4.5-4) */
  const searchSuggestedKeyword = (name: string) => {
    setInputText(name);
    runSearchNow(name);
  };

  /** 최근 검색어 탭 — 그 검색어로 즉시 검색 + 최신으로 끌어올린다 */
  const searchRecentQuery = (query: string) => {
    setInputText(query);
    runSearchNow(query);
  };

  /* ── 서버 조회 — 추천 키워드는 주제 칩 응답 재사용이다(explore-api.md 2-2, 별도 호출 없음) ── */
  const searchQuery = useExploreSearchQuery(activeQuery);
  const topicsQuery = useExploreTopicsQuery();

  /* ── 커서 무효 — 커서를 버리고 첫 페이지부터. 사용자에게 노출하지 않는다(explore-api.md 5장) ── */
  const { error: searchError, refetch: refetchSearch } = searchQuery;
  useEffect(() => {
    if (isApiError(searchError) && searchError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID) {
      void refetchSearch();
    }
  }, [searchError, refetchSearch]);

  /* ── 목록 파생값 ── */
  /** 회수(403)로 화면에서 걷어낸 행 — 서버 재조회 전까지 로컬로 가린다(피드와 동일) */
  const [hiddenContentIds, setHiddenContentIds] = useState<ReadonlySet<string>>(new Set());
  const hideRow = useCallback((contentId: string) => {
    setHiddenContentIds((prev) => new Set(prev).add(contentId));
  }, []);

  const pages = searchQuery.data?.pages;
  const results = useMemo(
    () =>
      (pages ?? [])
        .flatMap((page) => page.items)
        .filter((item) => !hiddenContentIds.has(item.content.id)),
    [pages, hiddenContentIds],
  );

  // 빈 결과의 대체 노출(E7) — 첫 페이지에만 실려 온다(items가 있으면 null)
  const fallback = pages?.[0]?.fallback ?? null;
  const fallbackItems = useMemo(
    () => (fallback?.popularItems ?? []).filter((item) => !hiddenContentIds.has(item.content.id)),
    [fallback, hiddenContentIds],
  );

  /* ── 화면 모드 ── */
  const isInitialMode = activeQuery === null;
  /** 입력이 있는데 실행할 수 없는 질의다(1자·특수문자만) — 초기 화면을 유지한 채 안내만 얹는다(7장) */
  const showEmptyPrompt = inputText.trim().length > 0 && !isSearchableQuery(inputText);
  /** 직전 결과조차 없는 첫 검색 로딩 — 인라인 스피너 하나다(스켈레톤을 쓰지 않는다, uiux 4.6) */
  const isFirstSearchLoading =
    !isInitialMode && searchQuery.data === undefined && searchQuery.isFetching;
  const isNoResult =
    !isInitialMode && searchQuery.data !== undefined && !searchQuery.isPlaceholderData
      ? results.length === 0 && fallback !== null
      : false;
  /** 질의가 바뀌어 직전 질의 결과를 유지한 채 로딩 중이다 — 결과를 지우지 않는다(explore.md 5장) */
  const isShowingStaleResults = searchQuery.isPlaceholderData && searchQuery.isFetching;

  /* ── 검색 실패 배너 — 이전 결과(또는 초기 화면)를 유지하고 상단 배너로 알린다(explore.md 7장) ── */
  const errorBanner = useMemo(() => {
    if (isInitialMode || !searchQuery.isError) return null;
    // 커서 무효는 자동 재조회 중이다 — 사용자에게 노출하지 않는다
    if (isApiError(searchError) && searchError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID)
      return null;
    // 명세가 명시한 것은 네트워크 끊김이다 — 서버 오류도 같은 표현(결과 유지 + 배너)으로 통일한다
    return isNetworkError(searchError)
      ? EXPLORE_COPY.error.networkTitle
      : EXPLORE_COPY.error.loadFailedTitle;
  }, [isInitialMode, searchQuery.isError, searchError]);

  /* ── 결과 갱신 낭독 — 질의당 한 번, polite 채널의 대역이다(uiux 7) ── */
  const announcedQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (isInitialMode || pages === undefined || searchQuery.isPlaceholderData) return;
    if (announcedQueryRef.current === activeQuery) return;
    announcedQueryRef.current = activeQuery;
    const count = pages.flatMap((page) => page.items).length;
    AccessibilityInfo.announceForAccessibility(
      count > 0
        ? EXPLORE_COPY.search.resultCountA11y(activeQuery ?? '', count)
        : EXPLORE_COPY.search.noResult(activeQuery ?? ''),
    );
  }, [isInitialMode, pages, searchQuery.isPlaceholderData, activeQuery]);

  /* ── 낙관 반영 — 검색 캐시만 덮는다. 피드·필터 목록은 탐색 복귀 시 invalidate가 최신화한다 ── */
  const setCachedLibraryState = useCallback(
    (contentId: string, library: ExploreLibraryState | null) => {
      queryClient.setQueriesData<InfiniteData<ExploreSearchPage>>(
        { queryKey: [...exploreKeys.all, 'search'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.content.id === contentId ? { ...item, library } : item,
                  ),
                  // E7 대체 목록의 행도 담기/제거가 피드와 동일하게 동작한다(uiux 4.6)
                  fallback: page.fallback
                    ? {
                        ...page.fallback,
                        popularItems: page.fallback.popularItems.map((item) =>
                          item.content.id === contentId ? { ...item, library } : item,
                        ),
                      }
                    : null,
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

  /* ── 콘텐츠별 담기·해제 조작의 단조 증가 순번 — 오래된 응답을 무시한다(explore-api.md 4.3) ── */
  const seqRef = useRef(new Map<string, number>());
  const nextSeq = (contentId: string): number => {
    const seq = (seqRef.current.get(contentId) ?? 0) + 1;
    seqRef.current.set(contentId, seq);
    return seq;
  };
  const isLatestSeq = (contentId: string, seq: number): boolean =>
    seqRef.current.get(contentId) === seq;

  const saveMutation = useSaveContentMutation();
  const unsaveMutation = useUnsaveContentMutation();

  /* ── 재생 게이트 — 표시(잔여 숫자)를 숨긴 것이지 판정·팝업 규칙을 뺀 것이 아니다(explore.md 7장) ── */
  const playGate = usePlayGate({
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

  /* ── 행 동작 — 피드 행과 같은 문법·같은 동작이다(explore.md 4.5-3) ── */
  const [moreSheetItem, setMoreSheetItem] = useState<ExploreItem | null>(null);

  const handleRowPress = (item: ExploreItem) => {
    saveActiveQueryAsRecent();
    playGate.requestPlay(
      {
        contentId: item.content.id,
        isCountedToday: item.isCountedToday,
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

  const openMoreSheet = (item: ExploreItem) => {
    saveActiveQueryAsRecent();
    setMoreSheetItem(item);
  };

  /** E12 [상세 정보] — 검색도 탐색 흐름이다. 진입점은 explore로 전달한다(content-detail.md 2장) */
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
    // TODO(인앱 브라우저): architecture.md 9.3 — expo-web-browser 도입 검토. 현재는 피드와
    // 같은 Linking 패턴을 쓴다
    Linking.openURL(url).catch((linkError) =>
      logger.warn('[explore] open source link failed', linkError),
    );
  };

  const requestSave = (item: ExploreItem) => {
    setMoreSheetItem(null);
    const contentId = item.content.id;
    const previous = item.library;
    const seq = nextSeq(contentId);
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
    // 제거는 무음 — 시트가 닫히는 것이 곧 피드백이다(explore-uiux.md 4.4)
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

  /* ── 추가 로딩 — 피드와 동일한 커서 기반 20건 무한 스크롤(explore.md 4.5-3) ── */
  const loadMore = () => {
    if (isInitialMode) return;
    if (!searchQuery.hasNextPage || searchQuery.isFetchingNextPage || searchQuery.isFetching)
      return;
    void searchQuery.fetchNextPage();
  };

  const isLoadMoreFailed =
    searchQuery.isFetchNextPageError &&
    !(isApiError(searchError) && searchError.errorCode === ERROR_CODES.EXPLORE_CURSOR_INVALID);

  /* ── 이동 ── */
  /** [취소]·뒤로가기 — 피드로 복귀. 검색 상태는 화면 pop과 함께 버려진다(explore.md 4.5-1) */
  const cancel = () => navigation.goBack();

  /** E7 관련 주제 칩 — 그 주제의 단일 목록(E2)으로 이동한다(explore.md 4.5-3). 검색 화면은 pop된다 */
  const openTopicList = (topicId: string) => {
    navigation.navigate('Main', {
      screen: 'Tabs',
      params: { screen: 'Explore', params: { applyTopicId: topicId } },
    });
  };

  const goToLibrary = () => {
    navigation.navigate('Main', { screen: 'Tabs', params: { screen: 'Library' } });
  };

  return {
    // 질의 입력
    inputText,
    activeQuery,
    handleChangeText,
    submitSearch,
    cancel,
    // 검색 초기 화면(E6)
    isInitialMode,
    showEmptyPrompt,
    recentSearches,
    searchRecentQuery,
    deleteRecentSearch,
    clearAllRecentSearches,
    suggestedTopics: topicsQuery.data ?? [],
    searchSuggestedKeyword,
    // 결과(E6 변형)·빈 결과(E7)
    results,
    isFirstSearchLoading,
    isShowingStaleResults,
    isNoResult,
    relatedTopics: fallback?.relatedTopics ?? [],
    fallbackItems,
    openTopicList,
    errorBanner,
    // 추가 로딩
    loadMore,
    isFetchingNextPage: searchQuery.isFetchingNextPage,
    isLoadMoreFailed,
    retryLoadMore: () => void searchQuery.fetchNextPage(),
    // 재생
    handleRowPress,
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
    // 더보기 시트 — 상세 정보·원문 보기·담기/제거
    moreSheetItem,
    openMoreSheet,
    closeMoreSheet: () => setMoreSheetItem(null),
    openDetail,
    openSourceLink,
    requestSave,
    requestRemove,
  };
};
