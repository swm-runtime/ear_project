import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { track } from '@/shared/analytics';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { logger } from '@/shared/lib/logger';
import { traceJs } from '@/shared/monitoring/js-trace';
import {
  dismissPlayerNatively,
  USE_NATIVE_PLAYER_ZOOM,
  type NativeDismissResult,
} from '@/shared/navigation/zoom-transition';
import { useToastStore } from '@/shared/ui/toast.store';

import { useContentReviewLauncher } from '@/features/content-review';
import {
  settingsKeys,
  updateUserSettings,
  useSettingsQuery,
  type PlaybackRate,
} from '@/features/settings';
import { useDeferredSheetShare } from '@/features/share';

import { BUFFERING_INDICATOR_DELAY_MS, PLAYER_DELETE_UNDO_DURATION_MS } from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import type { PlayEntryPoint, PlaybackStartMeta, QueueEntry, QueueItem } from '../player.types';
import { takeLockedNextTarget, useIsAppActive } from './useLockedPlaybackHost';
import { usePlayGate } from './usePlayGate';
import { queueKeys } from './useQueueQuery';
import { upNextKeys } from './useUpNextQuery';
import { playbackService } from '../services/playback.service';
import { getPlayerLibraryBridge } from '../services/player-library.bridge';
import {
  appendToSnapshot,
  withoutSnapshotItem,
  withPagesItemId,
  withSnapshotItemId,
} from '../services/queue-context';
import { useLimitNoticeStore } from '../store/limit-notice.store';
import { usePlaybackStore } from '../store/playback.store';

/** Player 라우트 파라미터 — app 내비게이션 타입(MainStackParamList)과 모양을 맞춘다 */
type PlayerRouteParams = {
  Player: {
    contentId: string;
    entryPoint?: PlayEntryPoint;
    autoplay?: boolean;
    meta?: PlaybackStartMeta;
  };
};

/** PL1~PL10 화면 로직 전부 — Screen은 이 훅이 준 상태를 배치만 한다(convention.md 3.1) */
/** 플레이어 안에서 펼쳐지는 패널의 종류 — 하나만 열린다 */
export type PlayerPanelKind = 'script' | 'queue';

/** 줌 모달이 뜨는 중이라 네이티브가 `busy` 로 답할 때 다시 닫아 보는 횟수·간격 — 확대 모션(≈0.5초)을 넘기면 된다 */
const NATIVE_DISMISS_BUSY_RETRIES = 4;
const NATIVE_DISMISS_BUSY_RETRY_MS = 300;

export const usePlayerScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<PlayerRouteParams, 'Player'>>();
  const { contentId } = route.params;
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  const session = usePlaybackStore((s) => s.session);
  const rate = usePlaybackStore((s) => s.rate);
  const isRateHydrated = usePlaybackStore((s) => s.isRateHydrated);

  // 재청취 창 밖 ▶의 확인 팝업·페이월 호스트는 플레이어다(paywall.md 4.2 예외 — 확정 2026-08-10)
  const playGate = usePlayGate();

  const [isRateSheetVisible, setIsRateSheetVisible] = useState(false);
  const [isSleepTimerSheetVisible, setIsSleepTimerSheetVisible] = useState(false);
  const [activePanel, setActivePanel] = useState<PlayerPanelKind | null>(null);
  const [isMoreSheetVisible, setIsMoreSheetVisible] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);
  /**
   * 재생 목록에서 숨겨 둘 라이브러리 항목 — 삭제를 고른 순간부터 **서버 삭제가 끝나고 목록을 다시 받을 때까지**.
   * 낙관 제거(캐시에서 걷기)만으로는 스낵바 5초 동안의 재조회(시트 단계 이동·다시 열기 — staleTime 0)가 서버에 아직 있는
   * 항목을 되살려, 지운 줄이 나타났다가 5초 뒤 사라졌다(PM 2026-10-23)
   */
  const [hiddenQueueItemIds, setHiddenQueueItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const hideQueueItem = (itemId: string) =>
    setHiddenQueueItemIds((current) => new Set(current).add(itemId));
  const unhideQueueItem = (itemId: string) =>
    setHiddenQueueItemIds((current) => {
      if (!current.has(itemId)) return current;
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateSeqRef = useRef(0);
  const pendingDetailRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      pendingDetailRef.current = null;
    },
    [contentId],
  );

  /*
   * ── 이 화면이 보여 주던 편에서 세션이 다른 편으로 넘어가면 화면도 따라간다 — 재생 목록 자동 재생(player.md 4.2-4)은
   * 화면 이동 없이 세션만 바꾼다. 따라가지 않으면 화면의 편(route)과 세션이 어긋나 세션 없음으로 읽혀 화면이 까맣게
   * 비었다(PM 2026-10-23). 직전 세션이 이 화면의 편(이거나 이미 따라가던 편)이었을 때만 따라간다 — 다른 편을 들고 들어온
   * 진입(딥링크·확대)은 아래 진입 효과가 세션을 이 화면의 편으로 바꾸는 쪽이다 ──
   *
   * "따라가는 중"은 **렌더 안에서** 정한다(React 의 파생 상태 갱신 — 커밋 전에 다시 그린다). 종전엔 route 를 layout effect 의
   * setParams 로만 맞춰, 세션이 바뀐 그 렌더 하나는 "세션 없음"이라 화면 트리 전체가 빈 View 로 바뀌었다가 다시 마운트됐다 —
   * 그때 끌던 시트·시크바·재생 목록 손잡이의 제스처가 끝 신호를 못 받고 중간에 멈췄다(2026-10-24 전수조사)
   */
  const sessionContentId = session?.contentId ?? null;
  const [sessionSeen, setSessionSeen] = useState({ id: sessionContentId, isFollowing: false });
  if (sessionSeen.id !== sessionContentId) {
    setSessionSeen({
      id: sessionContentId,
      isFollowing:
        sessionContentId !== null &&
        sessionContentId !== contentId &&
        (sessionSeen.id === contentId || sessionSeen.isFollowing),
    });
  }
  const isFollowingSession = sessionSeen.id === sessionContentId && sessionSeen.isFollowing;
  const isActiveSession =
    session !== null && (session.contentId === contentId || isFollowingSession);
  // route 도 그리기 전에 맞춘다 — 저장·삭제·이탈 판정이 route 의 편을 본다
  useLayoutEffect(() => {
    if (isFollowingSession && sessionContentId !== null && sessionContentId !== contentId) {
      navigation.setParams({ contentId: sessionContentId } as never);
    }
  }, [isFollowingSession, sessionContentId, contentId, navigation]);

  /*
   * ── 세션 없음의 출구(KAN-257) — 열린 플레이어에서 세션이 사라지면 화면을 닫는다. 종전엔 "세션 정리 직후의 한 프레임"만
   * 가정해 빈 화면을 그렸고, 닫는 쪽이 따로 없는 정리(발급 먼저 경로의 회수·404 정리, 확인 팝업 [취소], 로그아웃 등)면 닫기
   * 수단 없이 흰 화면에 갇혔다. 한 번이라도 세션을 본 뒤에만 닫는다 — 미니플레이어 확대·딥링크는 첫 프레임에 세션이 없다(아래
   * 진입 효과가 세운다). 이미 닫는 중이면(차단 전환·PL9 [닫기]·축소) 다시 부르지 않고, 위에 다른 화면(상세)이 쌓여 있으면
   * 돌아왔을 때 닫는다 ──
   */
  const hasSession = session !== null;
  const hadSessionRef = useRef(hasSession);
  const isClosingRef = useRef(false);
  const isFocused = useIsFocused();
  const close = () => {
    isClosingRef.current = true;
    navigation.goBack();
  };

  /*
   * ── iOS 26 줌 갈래: 플레이어 라우트가 **JS 로 먼저 빠지지 않게** 한다(2026-10-24 전수조사) ──
   * 줌으로 띄운 모달을 JS 가 먼저 걷으면 RNS 가 화면 뷰를 스냅샷으로 갈아끼우고 UIKit dismiss 가 그 위에서 끝나지 못해 화면 전체
   * 터치가 죽었다(2026-09-27). 셰브론·끌어내리기는 네이티브 닫기를 먼저 탔지만, 나머지 길 — PL9 [닫기]·한도 403 자동 닫기·세션
   * 없음 닫기·플레이어 위에서 푸시·탭 이동(toTab) — 은 goBack/navigate 로 바로 걷었다. 라우트가 빠지기 직전(beforeRemove)에 가로채
   * UIKit 닫기를 먼저 시작하고, 그다음 원래 동작을 보낸다 — dismiss 중인 모달의 JS pop 은 RNS 가 전환 끝까지 기다린다(안전).
   * 건너뛰는 경우: 이미 네이티브 닫기를 시작했다(그 완료가 보내는 pop 이다) · 플레이어가 맨 위가 아니다(상세가 위에 있으면 네이티브는
   * 상세를 닫는다) · 플레이어 위에 시트·팝업이 떠 있다(네이티브가 그 RN 모달을 대신 닫아 장부가 어긋난다) — 셋 다 종전대로 걷는다
   */
  const isNativeDismissStartedRef = useRef(false);
  const hasOverlayRef = useRef(false);
  const hasOverlay =
    isRateSheetVisible ||
    isSleepTimerSheetVisible ||
    isMoreSheetVisible ||
    playGate.confirmState !== null;
  useEffect(() => {
    hasOverlayRef.current = hasOverlay;
  }, [hasOverlay]);
  const dismissNatively = async (): Promise<NativeDismissResult> => {
    isNativeDismissStartedRef.current = true;
    const result = await dismissPlayerNatively();
    // 못 닫았다(전환 중·맨 위가 플레이어 아님 — 새 네이티브만 이렇게 답한다) — 다음 시도를 받는다
    if (result === 'busy' || result === 'not-screen') isNativeDismissStartedRef.current = false;
    return result;
  };
  /** UIKit 이 닫기를 조용히 무시했다(옛 네이티브는 그래도 `dismissed` 라 답한다) — 화면 워치독이 다시 닫을 수 있게 푼다 */
  const resetNativeDismiss = () => {
    isNativeDismissStartedRef.current = false;
  };
  useEffect(() => {
    if (!USE_NATIVE_PLAYER_ZOOM) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      if (isNativeDismissStartedRef.current || hasOverlayRef.current || !navigation.isFocused())
        return;
      event.preventDefault();
      traceJs('player remove → native dismiss first');
      // 뜨는 중(줌 확대 0.5초)이면 UIKit 이 닫기를 무시한다 — 잠깐 뒤 다시 닫는다. 끝내 못 닫으면 종전대로 걷는다
      const attempt = (count: number) => {
        void dismissNatively().then((result) => {
          if (result === 'busy' && count < NATIVE_DISMISS_BUSY_RETRIES) {
            setTimeout(() => attempt(count + 1), NATIVE_DISMISS_BUSY_RETRY_MS);
            return;
          }
          navigation.dispatch(event.data.action);
        });
      };
      attempt(0);
    });
  }, [navigation]);
  useEffect(() => {
    if (hasSession) {
      hadSessionRef.current = true;
      return;
    }
    if (!hadSessionRef.current || isClosingRef.current || !isFocused) return;
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close 는 ref·navigation 만 쓴다
  }, [hasSession, isFocused]);

  /* ── 진입 — 게이트를 거치지 않은 경로(미니플레이어 확대·딥링크)만 여기서 시작한다.
        확대는 재생을 시작시키지 않는다(uiux 4.8) — autoplay 기본 false(FR-24) ── */
  useEffect(() => {
    const current = usePlaybackStore.getState().session;
    if (!current || current.contentId !== contentId) {
      playbackService.start({
        contentId,
        entryPoint: route.params.entryPoint ?? 'miniplayer',
        autoplay: route.params.autoplay ?? false,
        // 목록이 넘긴 메타 — 발급 전에도 제목·썸네일을 그린다(미니플레이어가 비지 않는다)
        meta: route.params.meta,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입 시 1회: contentId가 이 화면의 정체성이다
  }, [contentId]);

  /* ── 화면 이탈은 즉시 저장 트리거다(player.md 4.3). 재생은 유지된다(축소 ≠ 정지) ── */
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      pendingDetailRef.current = null;
      playbackService.flushProgress('screen_leave');
    });
    return unsubscribe;
  }, [navigation]);

  /* ── 전역 배속 하이드레이션 — 저장소는 user_settings 하나다(settings-api.md 4.2 소관).
        사용자가 이 세션에서 먼저 바꿨으면 서버 값으로 덮지 않는다 ── */
  const settingsQuery = useSettingsQuery(!isRateHydrated);
  const serverRate = settingsQuery.data?.settings.defaultPlaybackRate;
  useEffect(() => {
    if (serverRate === undefined || usePlaybackStore.getState().isRateHydrated) return;
    usePlaybackStore.setState({ rate: serverRate, isRateHydrated: true });
    playbackService.applyRate(serverRate);
  }, [serverRate]);

  /* ── 발급·재생 시작의 한도·잠금 403 — 플레이어를 닫고 페이월/한도 안내/잠금 시트로 전환(player-api.md 5장 · experiments-api.md 4.2-3) ── */
  const blockedState = isActiveSession && session.state === 'blocked' ? session.blocked : null;
  useEffect(() => {
    if (!blockedState) return;
    // 결제 뒤 다시 틀 콘텐츠 — 세션을 내리기 전에 잡아 둔다(paywall.md 4.5-5). 재생 목록 맥락도 함께 — 결제 뒤 다시 틀어도
    // 같은 목록이다(KAN-258 — 빠뜨리면 게이트가 라이브러리 맥락으로 덮는다)
    const blockedStore = usePlaybackStore.getState();
    const blockedContentId = blockedStore.session?.contentId ?? contentId;
    const blockedQueue = blockedStore.queueContext;
    playbackService.clearSession();
    close();
    if (blockedState.kind === 'series_locked') {
      // 잠긴 편(KAN-294) — 한도 시트가 아니라 잠금 시트. 결제 뒤 다시 틀 편은 페이월과 같이 넘긴다
      playGate.openSeriesLock('player', blockedState.message ?? undefined, {
        contentId: blockedContentId,
        isCountedToday: false,
        queue: blockedQueue,
      });
    } else if (blockedState.kind === 'paywall') {
      // 세션이 어디서 왔든 사용자가 본 것은 플레이어 화면이다
      playGate.openPaywall('player', blockedState.message ?? undefined, {
        contentId: blockedContentId,
        isCountedToday: false,
        queue: blockedQueue,
      });
    } else {
      useLimitNoticeStore
        .getState()
        .show(blockedState.message ?? PLAYER_COPY.paidLimitReachedToast);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blocked 전이 1회에만 반응한다
  }, [blockedState]);

  /*
   * ── 자동 재생이 잠긴 다음 편 앞에서 멈췄다(KAN-302) — 플레이어를 닫고 잠금 시트로. 차단 403 과 같은 순서다(플레이어 모달 위에 시트를
   * 겹치지 않는다). 듣던 편 세션은 남긴다 — 미니플레이어에 끝난 편이 그대로 있다. 위에 상세가 쌓였으면 돌아왔을 때, 화면 밖이면
   * 앱이 앞으로 올 때 ──
   */
  const lockedNext = usePlaybackStore((s) => s.lockedNext);
  const isAppActive = useIsAppActive();
  useEffect(() => {
    if (lockedNext === null || !isAppActive || !isFocused) return;
    const target = takeLockedNextTarget();
    if (target === null) return;
    close();
    playGate.openSeriesLock('player', undefined, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록이 생기거나 화면이 앞으로 온 때에만 반응한다
  }, [lockedNext, isAppActive, isFocused]);

  /* ── 삭제 — 스낵바 5초가 사라진 뒤에 서버 요청을 보낸다(library.md 4.5 규칙 준용) ── */
  const commitDelete = (itemId: string) => {
    const bridge = getPlayerLibraryBridge();
    if (!bridge) return;
    bridge
      .deleteItem(itemId)
      .then(async () => {
        bridge.invalidateLibrary();
        // 재생 목록(라이브러리 첫 페이지) 캐시도 서버와 다시 맞춘다 — 스와이프 삭제의 낙관 제거를 확정한다.
        // 다시 받은 목록에 그 항목이 없을 때까지 숨김을 유지한다(위 hiddenQueueItemIds)
        await queryClient.invalidateQueries({ queryKey: queueKeys.all });
      })
      .catch(async () => {
        showToast(PLAYER_COPY.deleteSnackbar.failedToast);
        await queryClient.invalidateQueries({ queryKey: queueKeys.all });
      })
      .finally(() => unhideQueueItem(itemId));
  };
  /** 스낵바 [실행 취소]가 되돌릴 로컬 변화 — 스와이프 삭제는 목록에서 먼저 걷어 둔 줄을 제자리에 돌려 놓는다 */
  const undoLocalRef = useRef<(() => void) | null>(null);

  const commitDeleteRef = useRef(commitDelete);
  const pendingDeleteRef = useRef<string | null>(null);
  useEffect(() => {
    commitDeleteRef.current = commitDelete;
    pendingDeleteRef.current = pendingDeleteItemId;
  });

  // 화면 이탈 시 대기 중 삭제를 즉시 확정한다 — 놓치면 서버와 로컬이 어긋난다
  useEffect(
    () => () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      if (pendingDeleteRef.current) commitDeleteRef.current(pendingDeleteRef.current);
    },
    [],
  );

  /** 삭제 대기 공통 — 스낵바 5초 뒤 서버 삭제. 연속 조작은 이전 대기분을 즉시 확정하고 스낵바를 교체한다 */
  const startPendingDelete = (itemId: string, undoLocal: (() => void) | null) => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    if (pendingDeleteRef.current) commitDeleteRef.current(pendingDeleteRef.current);
    undoLocalRef.current = undoLocal;
    setPendingDeleteItemId(itemId);
    hideQueueItem(itemId);
    deleteTimerRef.current = setTimeout(() => {
      deleteTimerRef.current = null;
      undoLocalRef.current = null;
      setPendingDeleteItemId(null);
      commitDeleteRef.current(itemId);
    }, PLAYER_DELETE_UNDO_DURATION_MS);
  };

  const requestDelete = () => {
    setIsMoreSheetVisible(false);
    const itemId = session?.libraryItem?.id;
    if (!itemId) return;
    startPendingDelete(itemId, null);
  };

  /** 스낵바가 떠 있는 동안은 서버 호출이 없었다 — 로컬 취소뿐이다 */
  const undoDelete = () => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    undoLocalRef.current?.();
    undoLocalRef.current = null;
    if (pendingDeleteItemId !== null) unhideQueueItem(pendingDeleteItemId);
    setPendingDeleteItemId(null);
  };

  /**
   * 재생 목록 줄을 왼쪽으로 밀어 삭제(KAN-241 "3번"). 탐색 맥락은 **스냅샷에서 빼기**(로컬, 서버 요청 없음, 실행 취소 없음).
   * 라이브러리 맥락은 PL7 더보기와 같은 소프트 삭제 — 목록에서 먼저 걷고(낙관) 스낵바 5초 뒤 서버(library.md 4.5), [실행 취소]는
   * 걷어 둔 줄을 제자리에 돌려 놓는다. 지금 듣는 편은 밀리지 않는다(패널이 막지만 여기서도 지킨다)
   */
  const deleteQueueItem = (item: QueueEntry) => {
    if (item.contentId === contentId) return;
    const store = usePlaybackStore.getState();
    if (store.queueContext.kind === 'explore') {
      store.setQueueContext(withoutSnapshotItem(store.queueContext, item.contentId));
      return;
    }
    const itemId = item.itemId;
    if (itemId === null) return;
    const previous = queryClient.getQueryData<QueueItem[]>(queueKeys.all) ?? [];
    const index = previous.findIndex((entry) => entry.itemId === itemId);
    const removed = index === -1 ? null : previous[index];
    queryClient.setQueryData<QueueItem[]>(queueKeys.all, (current = []) =>
      current.filter((entry) => entry.itemId !== itemId),
    );
    startPendingDelete(itemId, () => {
      if (removed === null) return;
      queryClient.setQueryData<QueueItem[]>(queueKeys.all, (current = []) =>
        current.some((entry) => entry.itemId === itemId)
          ? current
          : [...current.slice(0, index), removed, ...current.slice(index)],
      );
    });
  };

  /* ── 컨트롤 ── */

  const handlePlayPausePress = () => {
    if (!isActiveSession) return;
    if (session.state === 'ended') {
      // 완료 상태의 ▶ = 위치 0부터 + replay 신호. 판정은 서버 몫 — 창 밖이면 403이 플레이어로
      // 돌아온다. 같은 세션의 재청취는 창 내이므로 팝업 힌트는 차감 없음으로 둔다(paywall.md 4.3-1).
      // 같은 편을 다시 듣는 것이라 재생 목록 맥락을 그대로 넘긴다(KAN-258 — 빠뜨리면 게이트가 라이브러리 맥락으로 덮는다)
      playGate.requestPlay(
        {
          contentId,
          isCountedToday: true,
          restartFromBeginning: true,
          queue: usePlaybackStore.getState().queueContext,
          meta: session.meta.title
            ? {
                title: session.meta.title,
                authorName: session.meta.authorName ?? undefined,
                sourceName: session.meta.sourceName ?? undefined,
                thumbnailUrl: session.meta.thumbnailUrl ?? undefined,
                durationSec: session.durationSec,
                topicIds: session.meta.topicIds,
              }
            : undefined,
        },
        'player',
      );
      return;
    }
    // 멈춘 채 연 푸시 콘텐츠의 첫 ▶ — 확인 팝업(차감되는 재생이면)을 거친다(KAN-273)
    if (
      session.state === 'ready' &&
      !session.isPlaying &&
      usePlaybackStore.getState().confirmBeforePlayContentId === contentId
    ) {
      playGate.requestHeldPlay(contentId, 'push');
      return;
    }
    playbackService.togglePlayPause();
  };

  const queueEntryTarget = (item: QueueEntry) => ({
    contentId: item.contentId,
    isCountedToday: item.isCountedToday,
    // 잠긴 줄은 게이트가 잠금 시트로 받는다(KAN-294) — 듣던 편은 그대로다
    isLocked: item.isLocked,
    meta: {
      title: item.title,
      authorName: item.authorName ?? undefined,
      sourceName: item.sourceName ?? undefined,
      thumbnailUrl: item.thumbnailUrl ?? undefined,
      durationSec: item.durationSec ?? undefined,
      // 고른 편의 주제 — 빠뜨리면 카테고리 줄이 사라진다(2026-09-18 PM 지적)
      topicIds: item.topicIds,
    },
  });

  /**
   * 재생 목록에서 다른 편을 고른다 — **게이트를 거친다.** 재생 진입점이 하나 늘어난 것이므로 여기서
   * playbackService.start 를 직접 부르면 한도 확인 팝업을 건너뛰는 다섯 번째 경로가 생긴다
   * (paywall.md 4.2 — 모든 경로가 단일 게이트). 진입점은 목록의 정체를 따른다 — 라이브러리 맥락 `library`,
   * 탐색 스냅샷 맥락 `explore`(KAN-241). **맥락은 그대로 넘긴다** — 그 목록 안에서 옮겨 다닌 것이다.
   * 지금 듣고 있는 편을 다시 고르면 아무 일도 하지 않는다 — 재시작이 아니라 오조작이다.
   */
  const playQueueItem = (item: QueueEntry) => {
    setActivePanel(null);
    if (item.contentId === contentId) return;
    const queue = usePlaybackStore.getState().queueContext;
    playGate.requestPlay(
      { ...queueEntryTarget(item), queue },
      queue.kind === 'library' ? 'library' : 'explore',
    );
  };

  /**
   * "다음에 들어볼 만한"의 줄을 틀었다(player.md 4.2-2) — 맥락은 바뀌지 않고 그 편이 스냅샷(지금 듣는 편 뒤)에 더해진다.
   * 진입점은 `player`(플레이어 안에서 시작한 재생). 자동 재생이 아니다 — 사용자가 고른 편만 재생된다(FR-24)
   */
  const playUpNextItem = (item: QueueEntry) => {
    setActivePanel(null);
    if (item.contentId === contentId) return;
    const current = usePlaybackStore.getState().queueContext;
    playGate.requestPlay(
      { ...queueEntryTarget(item), queue: appendToSnapshot(current, item, contentId) },
      'player',
    );
  };

  /**
   * 탐색 맥락 줄·추천 줄의 담기(KAN-241) — 탐색 타일의 담기와 같은 뜻. 낙관 반영(스냅샷·추천 캐시 `itemId` 임시 채움) → 서버 →
   * 실패면 되돌리고 토스트. 같은 편을 연달아 담으면 마지막 요청의 결과만 쓴다(`saveSeqRef`). 라이브러리 목록 재조회는 브리지가,
   * 라이브러리 맥락 재생 목록 재조회는 여기서 한다. 담기는 횟수 제한이 없고 페이월을 노출하지 않는다(PRD 5.4)
   */
  const saveSeqRef = useRef(new Map<string, number>());
  /**
   * 담기 결과를 줄이 온 두 곳에 함께 쓴다 — 탐색 맥락 스냅샷과 추천 블록 캐시(KAN-259). 추천 줄은 스냅샷이 아니라 추천 쿼리에서
   * 오므로 스냅샷만 고치면 담기 면이 다시 드러났다. 그 편이 없는 쪽은 그대로다
   */
  const reflectSavedItemId = (contentId: string, itemId: string | null) => {
    const latest = usePlaybackStore.getState();
    latest.setQueueContext(withSnapshotItemId(latest.queueContext, contentId, itemId));
    queryClient.setQueriesData<InfiniteData<QueueEntry[]>>({ queryKey: upNextKeys.all }, (data) => {
      if (data === undefined) return data;
      const pages = withPagesItemId(data.pages, contentId, itemId);
      return pages === data.pages ? data : { ...data, pages };
    });
  };
  const saveQueueItem = (item: QueueEntry) => {
    if (item.itemId !== null) return;
    const bridge = getPlayerLibraryBridge();
    if (!bridge) return;
    const seq = (saveSeqRef.current.get(item.contentId) ?? 0) + 1;
    saveSeqRef.current.set(item.contentId, seq);
    reflectSavedItemId(item.contentId, `optimistic-${item.contentId}`);
    bridge
      .saveContent(item.contentId, seq)
      .then((itemId) => {
        if (saveSeqRef.current.get(item.contentId) !== seq) return;
        reflectSavedItemId(item.contentId, itemId);
        showToast(PLAYER_COPY.queuePanel.saveToast);
        // 라이브러리 맥락의 재생 목록은 서버 목록(라이브러리 첫 페이지)이다 — 담은 편이 들어가도록 다시 맞춘다
        if (usePlaybackStore.getState().queueContext.kind === 'library') {
          void queryClient.invalidateQueries({ queryKey: queueKeys.all });
        }
      })
      .catch((error: unknown) => {
        if (saveSeqRef.current.get(item.contentId) !== seq) return;
        logger.warn('[player] queue save failed', error);
        reflectSavedItemId(item.contentId, null);
        showToast(PLAYER_COPY.queuePanel.saveFailedToast);
      });
  };

  /** PL7 [상세 정보] — 시트를 닫고 상세 화면으로 이동한다(player-uiux.md 4.7, 추가 2026-08-23).
      재생은 유지되고 뒤로가기로 플레이어에 복귀한다(content-detail.md 2장) */
  const openDetail = () => {
    // 딤이 걷히는 동안 상세 push를 시작하면 서로 다른 전환이 겹친다. 실제 닫힘을 기다린다.
    pendingDetailRef.current = contentId;
    setIsMoreSheetVisible(false);
  };

  /** PL7 [공유](SH1, P1) — 시트를 닫고 OS 공유 시트를 연다. 재생은 유지된다(share.md 2).
      세션 메타의 제목이 아직 없으면 열지 않는다 — 반쪽 값으로 공유 내용을 만들지
      않는다(share-uiux.md 4.2와 같은 원칙). 출처는 더 보지 않는다: 확정 형식이
      제목/링크 두 줄이라 메시지에 쓰이지 않는데, 그걸로 공유를 막으면 열려야 할 때 안 열린다.
      공유는 시트가 닫힌 뒤 열린다 — iOS의
      Modal dismiss ↔ 시스템 시트 present 경합 우회(useDeferredSheetShare) */
  const { requestShare, handleSheetDismiss } = useDeferredSheetShare();
  // PL7 [후기] → 후기 시트(L17) · 발급 안내(L19) — 플레이어(네이티브 모달) 안에 그려 같은 층에 뜬다(KAN-280)
  const reviewLauncher = useContentReviewLauncher();
  const handleMoreSheetDismiss = () => {
    const detailContentId = pendingDetailRef.current;
    pendingDetailRef.current = null;
    if (detailContentId !== null) {
      navigation.navigate('Main', {
        screen: 'ContentDetail',
        params: { contentId: detailContentId, entryPoint: 'player' },
      });
      return;
    }
    handleSheetDismiss();
    reviewLauncher.handleHostSheetClosed();
  };
  /** PL7 [후기](KAN-280) — 시트를 닫고 닫힘이 끝나면 후기 시트를 연다. 제목이 아직 없으면 열지 않는다(공유와 같은 원칙) */
  const openReview = () => {
    const meta = session?.meta;
    if (!meta?.title) return;
    setIsMoreSheetVisible(false);
    reviewLauncher.request(
      { contentId, title: meta.title, thumbnailUrl: meta.thumbnailUrl ?? null },
      { afterHostSheetClosed: true },
    );
  };
  const sharePress = () => {
    const meta = session?.meta;
    if (!meta?.title) return;
    setIsMoreSheetVisible(false);
    requestShare({ contentId, title: meta.title });
  };

  /* ── 원문 보기(FR-12) — 클릭 기록과 브라우저 열기는 서로를 기다리지 않는다(player-api.md 4.5) ── */
  const openSourceLink = () => {
    const url = session?.meta.sourceUrl;
    if (!url) return;
    setIsMoreSheetVisible(false);
    track('source_link_click', { content_id: contentId });
    playbackService.recordSourceLinkClick(contentId);
    // TODO(인앱 브라우저): architecture.md 9.3 — expo-web-browser 도입 검토. 현재는 설정 화면과
    // 같은 Linking 패턴을 쓴다
    Linking.openURL(url).catch((error) => logger.warn('[player] open source link failed', error));
  };

  /* ── PL4 배속 — 탭 즉시 적용 + 전역 저장 + 닫힘. 저장 실패 시 원복·에러 UI 없음(uiux 4.5) ── */
  const selectRate = (nextRate: PlaybackRate) => {
    setIsRateSheetVisible(false);
    usePlaybackStore.setState({ rate: nextRate, isRateHydrated: true });
    playbackService.applyRate(nextRate);
    rateSeqRef.current += 1;
    updateUserSettings({
      patch: { default_playback_rate: nextRate },
      clientSeq: rateSeqRef.current,
    })
      .then(() => queryClient.invalidateQueries({ queryKey: settingsKeys.summary() }))
      .catch(() => undefined);
  };

  /* ── PL9 회수 [닫기] — 세션을 내리고 원래 화면으로 복귀. 목록 정리는 라이브러리 소유 ── */
  const closeWithdrawn = () => {
    playbackService.clearSession();
    close();
  };

  const collapse = close;

  const isLoading = isActiveSession && session.state === 'loading';
  const isBuffering = isActiveSession && session.state === 'ready' && session.isBuffering;
  // 로딩 표시는 재생 버튼 자리에만, 2초를 넘을 때만(player.md 4.1 — 0.3초 공통 규칙보다 우선)
  const showBufferingIndicator = useDelayedVisible(
    isLoading || isBuffering,
    BUFFERING_INDICATOR_DELAY_MS,
  );

  return {
    contentId,
    session: isActiveSession ? session : null,
    rate,
    showBufferingIndicator,
    // 컨트롤
    handlePlayPausePress,
    seekBackward: () => playbackService.seekBackward(),
    seekForward: () => playbackService.seekForward(),
    seekTo: (sec: number) => playbackService.seekTo(sec),
    collapse,
    /** iOS 26 줌 갈래의 셰브론·끌어내리기 — UIKit 이 먼저 닫는다(위 beforeRemove 주석). 못 닫으면 false */
    dismissNatively,
    resetNativeDismiss,
    // 원문·배너
    openSourceLink,
    retryLoad: () => playbackService.retryLoad(),
    retryUrlRefresh: () => playbackService.retryUrlRefresh(),
    retryNetwork: () => playbackService.playWhenReady(),
    closeWithdrawn,
    // 배속 시트
    isRateSheetVisible,
    openRateSheet: () => setIsRateSheetVisible(true),
    closeRateSheet: () => setIsRateSheetVisible(false),
    isSleepTimerSheetVisible,
    openSleepTimerSheet: () => setIsSleepTimerSheetVisible(true),
    closeSleepTimerSheet: () => setIsSleepTimerSheetVisible(false),
    selectRate,
    // 펼침 패널(스크립트 PL6 · 다음 재생 목록) — 하나만 열리고, 열리면 아트워크가 압축된다
    activePanel,
    openPanel: (kind: PlayerPanelKind) => setActivePanel(kind),
    closePanel: () => setActivePanel(null),
    playQueueItem,
    playUpNextItem,
    saveQueueItem,
    deleteQueueItem,
    // 더보기 시트
    isMoreSheetVisible,
    openMoreSheet: () => setIsMoreSheetVisible(true),
    closeMoreSheet: () => setIsMoreSheetVisible(false),
    openDetail,
    sharePress,
    handleMoreSheetDismiss,
    /** [후기] 행 — 서버가 후기 기능을 켜 줬을 때만 그린다(받은 적 없거나 실패면 없음) */
    openReview: reviewLauncher.isEnabled ? openReview : undefined,
    reviewLauncher,
    requestDelete,
    pendingDeleteItemId,
    hiddenQueueItemIds,
    undoDelete,
    // 재청취 창 밖 ▶의 확인 팝업(플레이어 호스트 — paywall.md 4.2 예외)
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
  };
};
