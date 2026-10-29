import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { track } from '@/shared/analytics';
import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { toTab } from '@/shared/navigation/to-tab';
import { useToastStore } from '@/shared/ui/toast.store';

import { useContentReviewLauncher } from '@/features/content-review';
import { toTagQuery } from '@/features/explore';
import { libraryKeys } from '@/features/library';
import { usePlaybackStore, usePlayGate } from '@/features/player';
import { shareContent } from '@/features/share';

import { contentDetailKeys } from '../api/content-detail.api';
import { CONTENT_DETAIL_COPY } from '../content-detail.copy';
import type { ContentDetail, ContentDetailEntryPoint } from '../content-detail.types';
import { useContentDetailQuery } from './useContentDetailQuery';
import { useDeleteLibraryItemMutation } from './useDeleteLibraryItemMutation';
import { useSaveContentMutation } from './useSaveContentMutation';

/** ContentDetail 라우트 파라미터 — app 내비게이션 타입(MainStackParamList)과 모양을 맞춘다 */
type ContentDetailRouteParams = {
  ContentDetail: { contentId: string; entryPoint: ContentDetailEntryPoint };
};

const isNetworkError = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT);

/** CD1~CD4 화면 로직 전부 — Screen은 이 훅이 준 상태를 배치만 한다(convention.md 3.1) */
export const useContentDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ContentDetailRouteParams, 'ContentDetail'>>();
  const { contentId, entryPoint } = route.params;
  /** 공유 링크 수신 진입(share.md 4.3) — 복귀할 원 화면이 없어 복귀가 전부 라이브러리다(share-uiux.md 4.4) */
  const isShareLinkEntry = entryPoint === 'share';
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  // "현재 재생 중인 콘텐츠" 판정 재료 — 구독 전용(쓰기는 PlaybackService만)
  const playingContentId = usePlaybackStore((s) => s.session?.contentId ?? null);
  const isFocused = useIsFocused();

  const detailQuery = useContentDetailQuery(contentId);
  useEffect(() => {
    track('content_detail_view', { content_id: contentId, entry: entryPoint });
  }, [contentId, entryPoint]);
  const saveMutation = useSaveContentMutation();
  const deleteMutation = useDeleteLibraryItemMutation();

  /** 담기·삭제 조작의 단조 증가 순번 — 오래된 응답을 화면에 덮어쓰지 않는다(uiux 4.3) */
  const seqRef = useRef(0);
  const nextSeq = (): number => (seqRef.current += 1);
  const isLatestSeq = (seq: number): boolean => seqRef.current === seq;

  const setCachedDetail = (updater: (old: ContentDetail) => ContentDetail) => {
    queryClient.setQueryData<ContentDetail>(contentDetailKeys.detail(contentId), (old) =>
      old ? updater(old) : old,
    );
  };

  const invalidateLibrary = () => void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
  const invalidateDetail = () =>
    void queryClient.invalidateQueries({ queryKey: contentDetailKeys.detail(contentId) });

  const goToLibrary = () => {
    navigation.navigate('Main', toTab('Library'));
  };

  /**
   * 헤더 해시태그 탭 → 탐색 탭의 검색을 열고 `#태그`로 즉시 검색한다(KAN-219, content-detail-uiux.md 4.1). 이 화면이
   * 어느 탭 위에 있든(라이브러리·탐색·플레이어에서 연 상세) toTab 이 상세를 걷고 탐색 탭으로 돌아간다 — 검색을 여는 것은
   * 탐색 화면(파라미터 수신)이다. 피드 상태는 그대로다(explore.md 4.5-1)
   */
  const openTagSearch = (tag: string) => {
    navigation.navigate('Main', toTab('Explore', { searchQuery: toTagQuery(tag) }));
  };

  /**
   * 메타의 시리즈 줄 탭 → 시리즈 화면(E14 — explore.md 4.7, KAN-225). 라우트 이름으로만 이동한다 — 시리즈 화면은 explore 가
   * 소유하고 등록은 app/navigation 이 한다(content-detail 은 explore 화면을 import 하지 않는다). 시리즈 화면 → 상세에서 다시
   * 누르면 시리즈 화면이 한 장 더 쌓인다(React Navigation 7 의 navigate 는 현재 화면이 아니면 새로 쌓는다) — 뒤로가기로 차례로
   * 돌아오므로 그대로 둔다
   */
  const openSeries = (seriesId: string) => {
    navigation.navigate('Main', { screen: 'Series', params: { seriesId } });
  };

  /* ── 회수·404 — 상세를 그리지 않고 안내 후 원 화면 복귀(content-detail.md 4.1·7장, CD4) ── */
  const error = detailQuery.error;
  const redirectErrorCode =
    isApiError(error) &&
    (error.errorCode === ERROR_CODES.CONTENT_WITHDRAWN ||
      error.errorCode === ERROR_CODES.CONTENT_NOT_FOUND)
      ? error.errorCode
      : null;
  const isRedirecting = redirectErrorCode !== null;

  const hasRedirectedRef = useRef(false);
  // 복귀 내비게이션과 동기화한다 — 위에 플레이어가 떠 있으면(비포커스) 복귀를 포커스 시점으로 미룬다
  useEffect(() => {
    if (redirectErrorCode === null || !isFocused || hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    // 서버 message 우선(architecture.md 8.1) — 회수 안내는 세 화면 공통 문자열이다
    showToast((isApiError(error) ? error.message : null) ?? CONTENT_DETAIL_COPY.withdrawnToast);
    if (redirectErrorCode === ERROR_CODES.CONTENT_WITHDRAWN) {
      // 라이브러리에서 진입했다면 복귀한 목록도 갱신되어야 한다(library.md 회수 동기화)
      invalidateLibrary();
    }
    // 공유 링크 수신은 복귀할 원 화면이 없다 — 라이브러리로 간다(share-uiux.md 4.4, CD4 변형)
    if (isShareLinkEntry) goToLibrary();
    else navigation.goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 복귀는 에러·포커스 전이에 1회만 반응한다
  }, [redirectErrorCode, isFocused]);

  /* ── [재생] — 행 탭과 동일한 판정 경로(paywall.md 4.1~4.2). 게이트가 팝업·페이월·이동을 소유한다 ── */
  const playGate = usePlayGate({
    // 재생 성공·회수 등 서버 상태 변화 — 복귀 시점의 상세(담김·재청취 창)를 최신으로 만든다
    onServerStateChanged: () => {
      invalidateDetail();
      invalidateLibrary();
    },
    // 재생해도 라이브러리에 담지 않는다 — 자동 적립은 뺐다(PM 2026-10-23, explore.md 4.4)
    onPlayStarted: () => {
      // 이 재생으로 재청취 창 안이 됐다 — 팝업 힌트를 갱신한다(값은 판정이 아니다)
      setCachedDetail((old) => ({ ...old, isCountedToday: true }));
    },
  });

  const detail = detailQuery.data;

  /* ── "내 후기"(KAN-280) — 줄을 누르면 후기 시트(L17)를 이 화면 안에 연다. 앞에 닫힐 시트가 없어 바로 연다 ── */
  const reviewLauncher = useContentReviewLauncher();
  const openReview = () => {
    if (!detail) return;
    reviewLauncher.request({
      contentId,
      title: detail.content.title,
      thumbnailUrl: detail.content.thumbnailUrl,
    });
  };

  const requestPlay = () => {
    if (!detail) return;
    // 현재 재생 중인 콘텐츠면 새 재생 없이 플레이어로 복귀한다 — 판정·차감이 다시 일어나지
    // 않는다(content-detail.md 4.4). 플레이어에서 진입한 경우가 대표 경로다
    if (playingContentId === contentId) {
      // 아래에 있는 플레이어로 돌아간다(`pop`) — 새로 쌓으면 플레이어가 두 장이 됐다(2026-10-24 전수조사)
      navigation.navigate('Main', { screen: 'Player', params: { contentId }, pop: true });
      return;
    }
    playGate.requestPlay(
      {
        contentId,
        isCountedToday: detail.isCountedToday,
        // 서버가 잠갔다고 준 편이면 게이트가 발급 없이 잠금 시트를 띄운다(KAN-294)
        isLocked: detail.isLocked,
        // 상세가 이미 아는 메타 — 플레이어가 진입과 동시에 그린다(player-uiux.md 4.3)
        meta: {
          title: detail.content.title,
          authorName: detail.content.authorName ?? undefined,
          sourceName: detail.content.sourceName,
          thumbnailUrl: detail.content.thumbnailUrl,
          durationSec: detail.content.durationSec,
          topicIds: detail.content.topics.map((topic) => topic.id),
        },
        // 재생 시도 중 회수 — 재조회가 CD4 흐름(안내 후 복귀)을 태운다
        onWithdrawn: () => {
          invalidateDetail();
          invalidateLibrary();
        },
      },
      // entry_point는 원 화면 값 유지(content-detail-api.md 4.2 제안). player 진입은 위의
      // 현재 재생 중 분기로 끝나는 것이 정상이라 여기 오는 일 자체가 예외 경로다
      entryPoint,
    );
  };

  /* ── [담기]/[삭제] — 버튼 로딩 + 중복 탭 차단, 성공 시 버튼 전환(uiux 4.3) ── */
  const isActionPending = saveMutation.isPending || deleteMutation.isPending;

  const requestSave = () => {
    if (!detail || detail.libraryItem !== null || isActionPending) return;
    const seq = nextSeq();
    saveMutation.mutate(
      { contentId, clientSeq: seq, reason: 'user_save' },
      {
        onSuccess: (result) => {
          if (!isLatestSeq(seq)) return;
          setCachedDetail((old) => ({
            ...old,
            libraryItem: {
              id: result.libraryItem.itemId,
              source: result.libraryItem.source,
              status: result.libraryItem.status,
            },
          }));
          invalidateLibrary();
          showToast(CONTENT_DETAIL_COPY.saveToast, {
            label: CONTENT_DETAIL_COPY.saveToastAction,
            onPress: goToLibrary,
          });
        },
        onError: (saveError) => {
          if (!isLatestSeq(seq)) return;
          if (
            isApiError(saveError) &&
            (saveError.errorCode === ERROR_CODES.CONTENT_WITHDRAWN ||
              saveError.errorCode === ERROR_CODES.CONTENT_NOT_FOUND)
          ) {
            // 담는 사이 회수됐다 — 재조회가 CD4 흐름(안내 후 원 화면 복귀)을 태운다
            invalidateDetail();
            return;
          }
          // 버튼은 pending 해제로 원상 유지된다 — 토스트만 알린다(uiux 4.3)
          showToast(CONTENT_DETAIL_COPY.saveFailedToast);
        },
      },
    );
  };

  const requestDelete = () => {
    if (!detail || detail.libraryItem === null || isActionPending) return;
    const itemId = detail.libraryItem.id;
    const seq = nextSeq();
    deleteMutation.mutate(
      { itemId },
      {
        onSuccess: () => {
          if (!isLatestSeq(seq)) return;
          // 성공 피드백은 버튼 전환뿐(확정 2026-08-23 — 토스트·스낵바 없음). 재생 중이어도
          // 재생은 유지된다(player.md 7과 동일 — 세션을 건드리지 않는다)
          setCachedDetail((old) => ({ ...old, libraryItem: null }));
          invalidateLibrary();
          // 시각 피드백이 버튼 전환뿐이므로 스크린리더에는 한 번 알린다(uiux 7장)
          AccessibilityInfo.announceForAccessibility(CONTENT_DETAIL_COPY.deletedA11yAnnounce);
        },
        onError: () => {
          if (!isLatestSeq(seq)) return;
          showToast(CONTENT_DETAIL_COPY.deleteFailedToast);
        },
      },
    );
  };

  /** SH2 [공유](P1) — 앱바 우측 아이콘. 상세가 이미 든 값으로 조립하고 전송·취소 어느 쪽에도
      후속 동작이 없다(share.md 4.1·4.4). 조회 성공(CD1·CD2) 상태에서만 화면이 버튼을 그린다 */
  const shareDetail = () => {
    if (!detail) return;
    void shareContent({ contentId, title: detail.content.title });
  };

  /* ── 화면 상태 파생 ── */
  const isInitialLoading = detailQuery.isPending;
  const showSkeleton = useDelayedVisible(isInitialLoading);
  // 진입 조회 실패만 전면 에러다 — 회수·404는 위 복귀 흐름이 담당한다(CD3 vs CD4)
  const isFullError = detailQuery.isError && detail === undefined && !isRedirecting;
  const isFullErrorNetwork = isFullError && isNetworkError(detailQuery.error);

  return {
    detail,
    // 헤더 해시태그 → 탐색 검색(KAN-219)
    openTagSearch,
    openSeries,
    // 로딩·오류(CD3) — 앱바는 화면이 먼저 그린다(uiux 4.7)
    isInitialLoading,
    showSkeleton,
    isFullError,
    isFullErrorNetwork,
    isRetrying: detailQuery.isRefetching,
    retry: () => void detailQuery.refetch(),
    /** 회수·404 복귀 진행 중(CD4) — 상세를 그리지 않는다 */
    isRedirecting,
    // [재생] — 확인 팝업 호스트는 이 화면이다(진입점 화면들과 같은 구성)
    requestPlay,
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
    // [담기]/[삭제]
    isActionPending,
    requestSave,
    requestDelete,
    // [공유](SH2, P1)
    shareDetail,
    // "내 후기" — 줄은 후기 기능이 켜졌을 때만 그려진다(MyContentReviewRow 가 판정 값을 본다)
    contentId,
    openReview,
    reviewLauncher,
    // 복귀 — 공유 링크 수신은 뒤로 갈 원 화면이 없어 라이브러리로 간다(share-uiux.md 4.4)
    goBack: () => (isShareLinkEntry ? goToLibrary() : navigation.goBack()),
  };
};
