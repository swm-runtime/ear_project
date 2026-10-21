import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { generateId } from '@/shared/lib/generate-id';
import { logger } from '@/shared/lib/logger';
import { toTab } from '@/shared/navigation/to-tab';
import { useToastStore } from '@/shared/ui/toast.store';

import { libraryKeys } from '@/features/library';
import { sendSourceLinkClick, usePlayGate } from '@/features/player';
import { useDeferredSheetShare } from '@/features/share';

import { exploreKeys } from '../api/explore.api';
import { EXPLORE_COPY } from '../explore.copy';
import { toQueueSnapshot } from '../explore.queue';
import { pickSeriesPlayEpisode, seriesEpisodeSubtitle } from '../explore.series-episode';
import type { ExploreItem, ExploreLibraryState, SeriesDetail } from '../explore.types';
import { useSaveContentMutation } from './useSaveContentMutation';
import { useSeriesDetailQuery } from './useSeriesDetailQuery';
import { useUnsaveContentMutation } from './useUnsaveContentMutation';

/** 시리즈 화면 라우트 파람의 로컬 선언 — 원본은 app/navigation/types.ts 의 MainStackParamList(feature 는 app 을 import 하지 않는다) */
type SeriesRouteParams = {
  Series: { seriesId: string };
};

const isNetworkError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT);

/**
 * 404 로 받는 경우 — 없는 시리즈·다른 시장 시리즈·노출 편이 하나도 없는 시리즈(explore-api.md 4.7). uuid 가 아닌 id(400)도
 * 다시 시도해 봐야 같은 결과라 같은 안내로 받는다
 */
const isSeriesNotFound = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NOT_FOUND || error.errorCode === ERROR_CODES.VALIDATION_FAILED);

/**
 * 시리즈 화면(E14 — explore.md 4.7) ViewModel. 편 행의 동작은 탐색 행과 **같은 계약·같은 규칙**이다 — 행 탭 = 재생 확인 팝업
 * → 재생(진입점 `explore`, 자동 적립 포함 — explore.md 4.4), [더보기] = 상세 정보·원문 보기·담기/제거(4.3).
 * 머리 [재생](PM 2026-10-22)은 아직 다 듣지 않은 가장 앞 편 하나를 같은 재생 판정으로 튼다 — 연속 재생은 여전히 없다.
 * 앱바 캡슐: [공유](시리즈 제목 + 1화 링크) · ⋯ 시리즈 시트(공유 · 소개 전체 보기)
 */
export const useSeriesScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SeriesRouteParams, 'Series'>>();
  const { seriesId } = route.params;
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  const detailQuery = useSeriesDetailQuery(seriesId);
  const saveMutation = useSaveContentMutation();
  const unsaveMutation = useUnsaveContentMutation();

  /*
   * 플레이어·상세에서 돌아오면 편의 재생 위치·완청이 바뀌었을 수 있다 — 조용히 다시 받는다. 첫 포커스(진입)는 이미 받는 중이라
   * 건너뛴다(같은 요청을 두 번 내지 않게)
   */
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      void queryClient.invalidateQueries({ queryKey: exploreKeys.series(seriesId) });
    }, [queryClient, seriesId]),
  );

  /* ── 낙관 반영 — 진실은 쿼리 캐시 하나다(architecture.md 7.1) ── */
  const setCachedLibraryState = useCallback(
    (contentId: string, library: ExploreLibraryState | null) => {
      queryClient.setQueryData<SeriesDetail>(exploreKeys.series(seriesId), (old) =>
        old
          ? {
              ...old,
              episodes: old.episodes.map((episode) =>
                episode.item.content.id === contentId
                  ? { ...episode, item: { ...episode.item, library } }
                  : episode,
              ),
            }
          : old,
      );
    },
    [queryClient, seriesId],
  );

  const invalidateLibrary = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
    [queryClient],
  );

  /** 회수(403)로 걷어낸 편 — 서버 재조회 전까지 로컬로 가린다(탐색 행과 같다) */
  const [hiddenContentIds, setHiddenContentIds] = useState<ReadonlySet<string>>(new Set());
  const hideRow = useCallback((contentId: string) => {
    setHiddenContentIds((prev) => new Set(prev).add(contentId));
  }, []);

  /** 콘텐츠별 담기·해제 조작의 단조 증가 순번 — 오래된 응답을 무시한다(explore-api.md 4.3) */
  const seqRef = useRef(new Map<string, number>());
  const nextSeq = (contentId: string): number => {
    const seq = (seqRef.current.get(contentId) ?? 0) + 1;
    seqRef.current.set(contentId, seq);
    return seq;
  };
  const isLatestSeq = (contentId: string, seq: number): boolean =>
    seqRef.current.get(contentId) === seq;

  /* ── 재생 게이트 — 탐색 행과 한 갈래다(explore.md 4.4). 시리즈 화면은 탐색 흐름이라 진입점도 explore 다 ── */
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
          onError: () => undefined,
        },
      );
    },
  });

  /**
   * 편 행 탭 — 탐색 행과 같은 재생 판정(팝업·페이월·회수). `order`를 주면 재생 목록 스냅샷을 그 순서로(셔플) — 없으면 화수 순
   */
  const handleEpisodePress = (item: ExploreItem, order?: ExploreItem[]) => {
    const current = detailQuery.data;
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
          topicIds: item.content.topicIds,
        },
        onWithdrawn: () => hideRow(item.content.id),
        // 재생 목록 = 이 시리즈의 편 목록(KAN-241). "다음 화 듣기" 유도가 아니다 — 패널은 열람·선택 전용(PM 확인 항목)
        queue: current
          ? toQueueSnapshot(
              (order ?? current.episodes.map((episode) => episode.item)).filter(
                (episode) => !hiddenContentIds.has(episode.content.id),
              ),
              { type: 'series', title: current.series.title },
            )
          : undefined,
      },
      'explore',
    );
  };

  /* ── 더보기 시트 — 탐색과 같은 시트·같은 동작(explore.md 4.3) ── */
  const [moreSheetItem, setMoreSheetItem] = useState<ExploreItem | null>(null);

  const openDetail = (item: ExploreItem) => {
    setMoreSheetItem(null);
    navigation.navigate('Main', {
      screen: 'ContentDetail',
      params: { contentId: item.content.id, entryPoint: 'explore' },
    });
  };

  /** [원문 보기](FR-12) — 클릭 기록과 브라우저 열기는 서로를 기다리지 않는다(player-api.md 4.5) */
  const openSourceLink = (item: ExploreItem) => {
    const url = item.content.sourceUrl;
    if (!url) return;
    setMoreSheetItem(null);
    sendSourceLinkClick({ contentId: item.content.id, idempotencyKey: generateId() }).catch(
      (clickError) => logger.debug('[series] source link click record failed', clickError),
    );
    Linking.openURL(url).catch((linkError) =>
      logger.warn('[series] open source link failed', linkError),
    );
  };

  /** [공유](SH1, P1) — 시트가 닫힌 뒤 연다(useDeferredSheetShare — 탐색과 같은 우회) */
  const { requestShare, handleSheetDismiss } = useDeferredSheetShare();
  const shareItem = (item: ExploreItem) => {
    setMoreSheetItem(null);
    requestShare({ contentId: item.content.id, title: item.content.title });
  };

  const goToLibrary = () => {
    navigation.navigate('Main', toTab('Library'));
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
    // 제거는 무음 — 행의 "담음" 글자가 사라지는 것이 곧 피드백이다(explore-uiux.md 4.4)
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

  /* ── 화면 상태 ── */
  const detail = detailQuery.data;
  const episodes = useMemo(
    () =>
      (detail?.episodes ?? []).filter((episode) => !hiddenContentIds.has(episode.item.content.id)),
    [detail, hiddenContentIds],
  );

  /* ── 머리 [재생] — 아직 다 듣지 않은 가장 앞 편(전부 들었으면 1화). 판정·팝업은 편 행 탭과 같은 길 ── */
  const playEpisode = pickSeriesPlayEpisode(episodes);
  const playSeries = () => {
    if (playEpisode) handleEpisodePress(playEpisode.item);
  };

  /*
   * ── 셔플(PM 2026-10-22 08:55) — 편 목록을 섞어 맨 앞 편을 재생하고, 재생 목록 패널도 그 섞인 순서다. 자동 다음 재생은 여전히
   * 없다(FR-24 — 셔플은 "어느 편부터"와 "목록 순서"만 바꾼다). 판정·팝업은 편 행 탭과 같은 길 ──
   */
  const shuffleSeries = () => {
    const items = episodes.map((episode) => episode.item);
    if (items.length === 0) return;
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    handleEpisodePress(shuffled[0], shuffled);
  };

  /*
   * ── 시리즈 담기(PM 2026-10-22 08:55) — 노출 중인 편 중 라이브러리에 없는 편을 **편 단위로 전부** 담는다(서버는 편 담기 그대로 —
   * explore-api.md 4.3, 횟수 제한·페이월 없음). 새로 공개될 편은 따라 들어오지 않는다(시리즈 구독 아님 — 보류). 낙관 반영 후
   * 한 번에 보내고, 실패한 편만 되돌려 한 번 알린다. 전부 담겨 있으면 버튼이 체크로 바뀌고 아무것도 하지 않는다 ──
   */
  const isSeriesSaved =
    episodes.length > 0 && episodes.every((episode) => episode.item.library !== null);
  const saveSeries = () => {
    const targets = episodes.map((episode) => episode.item).filter((item) => item.library === null);
    if (targets.length === 0) return;
    const jobs = targets.map((item) => {
      const contentId = item.content.id;
      const seq = nextSeq(contentId);
      setCachedLibraryState(contentId, {
        itemId: `optimistic-${contentId}`,
        source: 'save',
        status: 'unplayed',
      });
      return { contentId, seq };
    });
    showToast(EXPLORE_COPY.series.saveAllToast(targets.length), {
      label: EXPLORE_COPY.saveToastAction,
      onPress: () => goToLibrary(),
    });
    void Promise.allSettled(
      jobs.map(({ contentId, seq }) => saveMutation.mutateAsync({ contentId, clientSeq: seq })),
    ).then((results) => {
      let failed = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') return;
        const { contentId, seq } = jobs[index];
        if (!isLatestSeq(contentId, seq)) return;
        const error: unknown = result.reason;
        if (
          isApiError(error) &&
          (error.errorCode === ERROR_CODES.CONTENT_WITHDRAWN ||
            error.errorCode === ERROR_CODES.CONTENT_NOT_FOUND)
        ) {
          hideRow(contentId);
          return;
        }
        setCachedLibraryState(contentId, null);
        failed += 1;
      });
      invalidateLibrary();
      if (failed > 0) showToast(EXPLORE_COPY.series.saveAllFailedToast);
    });
  };

  /*
   * ── 시리즈 공유 — 시리즈 전용 링크가 아직 없어 **1화(노출 중인 가장 앞 편) 상세 링크**에 시리즈 제목을 싣는다. 받은 사람은
   * 1화 상세의 시리즈 줄로 이 화면에 온다. 입구는 ⋯ 시트의 [공유] 하나 — 시트가 닫힌 뒤 연다(앱바 공유 아이콘은
   * 2026-10-22 PM 지시로 뺐다) ──
   */
  const seriesShareInput = () => {
    const first = episodes[0];
    if (!detail || !first) return null;
    return { contentId: first.item.content.id, title: detail.series.title, entry: 'series' };
  };
  const [isSeriesSheetOpen, setIsSeriesSheetOpen] = useState(false);
  const shareSeriesFromSheet = () => {
    setIsSeriesSheetOpen(false);
    const input = seriesShareInput();
    if (input) requestShare(input);
  };
  const isInitialLoading = detailQuery.isPending;
  const showSkeleton = useDelayedVisible(isInitialLoading);
  const isNotFound = !detail && isSeriesNotFound(detailQuery.error);
  const isFullError = detailQuery.isError && !detail && !isNotFound;

  return {
    detail: detail ?? null,
    episodes,
    /** 머리의 편수 — 노출 중인 편(서버가 준 목록) 수. 로컬로 가린 회수 편은 세지 않는다 */
    episodeCount: episodes.length,
    isInitialLoading,
    showSkeleton,
    isNotFound,
    isFullError,
    isFullErrorNetwork: isFullError && isNetworkError(detailQuery.error),
    isRetrying: detailQuery.isRefetching,
    retry: () => void detailQuery.refetch(),
    goBack: () => navigation.goBack(),
    // 재생
    handleEpisodePress,
    playTarget:
      playEpisode && detail
        ? {
            episodeNo: playEpisode.episodeNo,
            title: seriesEpisodeSubtitle(playEpisode.item.content.title, detail.series.title),
          }
        : null,
    playSeries,
    // [재생] 양옆 — 셔플 · 시리즈 담기(PM 2026-10-22 08:55)
    shuffleSeries,
    saveSeries,
    isSeriesSaved,
    // 앱바 ⋯ · 시리즈 시트
    isSeriesSheetOpen,
    openSeriesSheet: () => setIsSeriesSheetOpen(true),
    closeSeriesSheet: () => setIsSeriesSheetOpen(false),
    shareSeriesFromSheet,
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
    // 더보기 시트
    moreSheetItem,
    openMoreSheet: setMoreSheetItem,
    closeMoreSheet: () => setMoreSheetItem(null),
    openDetail,
    openSourceLink,
    shareItem,
    handleSheetDismiss,
    requestSave,
    requestRemove,
  };
};
