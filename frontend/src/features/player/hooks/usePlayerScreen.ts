import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import {
  settingsKeys,
  updateUserSettings,
  useSettingsQuery,
  type PlaybackRate,
} from '@/features/settings';

import { BUFFERING_INDICATOR_DELAY_MS, PLAYER_DELETE_UNDO_DURATION_MS } from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import type { PlayEntryPoint } from '../player.types';
import { usePlayGate } from './usePlayGate';
import { playbackService } from '../services/playback.service';
import { getPlayerLibraryBridge } from '../services/player-library.bridge';
import { usePlaybackStore } from '../store/playback.store';

/** Player 라우트 파라미터 — app 내비게이션 타입(MainStackParamList)과 모양을 맞춘다 */
type PlayerRouteParams = {
  Player: { contentId: string; entryPoint?: PlayEntryPoint; autoplay?: boolean };
};

/** PL1~PL10 화면 로직 전부 — Screen은 이 훅이 준 상태를 배치만 한다(convention.md 3.1) */
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
  const [isMoreSheetVisible, setIsMoreSheetVisible] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateSeqRef = useRef(0);

  const isActiveSession = session !== null && session.contentId === contentId;

  /* ── 진입 — 게이트를 거치지 않은 경로(미니플레이어 확대·딥링크)만 여기서 시작한다.
        확대는 재생을 시작시키지 않는다(uiux 4.8) — autoplay 기본 false(FR-24) ── */
  useEffect(() => {
    const current = usePlaybackStore.getState().session;
    if (!current || current.contentId !== contentId) {
      playbackService.start({
        contentId,
        entryPoint: route.params.entryPoint ?? 'miniplayer',
        autoplay: route.params.autoplay ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입 시 1회: contentId가 이 화면의 정체성이다
  }, [contentId]);

  /* ── 화면 이탈은 즉시 저장 트리거다(player.md 4.3). 재생은 유지된다(축소 ≠ 정지) ── */
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
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

  /* ── 발급·재생 시작의 한도 403 — 플레이어를 닫고 페이월/한도 안내로 전환(player-api.md 5장) ── */
  const blockedState = isActiveSession && session.state === 'blocked' ? session.blocked : null;
  useEffect(() => {
    if (!blockedState) return;
    playbackService.clearSession();
    navigation.goBack();
    if (blockedState.kind === 'paywall') {
      playGate.openPaywall(blockedState.message ?? undefined);
    } else {
      showToast(blockedState.message ?? PLAYER_COPY.paidLimitReachedToast);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blocked 전이 1회에만 반응한다
  }, [blockedState]);

  /* ── 삭제 — 스낵바 5초가 사라진 뒤에 서버 요청을 보낸다(library.md 4.5 규칙 준용) ── */
  const commitDelete = (itemId: string) => {
    const bridge = getPlayerLibraryBridge();
    if (!bridge) return;
    bridge
      .deleteItem(itemId)
      .then(() => bridge.invalidateLibrary())
      .catch(() => showToast(PLAYER_COPY.deleteSnackbar.failedToast));
  };

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

  const requestDelete = () => {
    setIsMoreSheetVisible(false);
    const itemId = session?.libraryItem?.id;
    if (!itemId) return;
    // 연속 조작 — 이전 대기분을 즉시 확정하고 스낵바를 교체한다
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    if (pendingDeleteRef.current) commitDeleteRef.current(pendingDeleteRef.current);

    setPendingDeleteItemId(itemId);
    deleteTimerRef.current = setTimeout(() => {
      deleteTimerRef.current = null;
      setPendingDeleteItemId(null);
      commitDeleteRef.current(itemId);
    }, PLAYER_DELETE_UNDO_DURATION_MS);
  };

  /** 스낵바가 떠 있는 동안은 서버 호출이 없었다 — 로컬 취소뿐이다 */
  const undoDelete = () => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    setPendingDeleteItemId(null);
  };

  /* ── 컨트롤 ── */

  const handlePlayPausePress = () => {
    if (!isActiveSession) return;
    if (session.state === 'ended') {
      // 완료 상태의 ▶ = 위치 0부터 + replay 신호. 판정은 서버 몫 — 창 밖이면 403이 플레이어로
      // 돌아온다. 같은 세션의 재청취는 창 내이므로 팝업 힌트는 차감 없음으로 둔다(paywall.md 4.3-1)
      playGate.requestPlay(
        {
          contentId,
          isCountedToday: true,
          restartFromBeginning: true,
          meta: session.meta.title
            ? {
                title: session.meta.title,
                authorName: session.meta.authorName ?? undefined,
                sourceName: session.meta.sourceName ?? undefined,
                thumbnailUrl: session.meta.thumbnailUrl ?? undefined,
                durationSec: session.durationSec,
              }
            : undefined,
        },
        'player',
      );
      return;
    }
    playbackService.togglePlayPause();
  };

  /** PL7 [상세 정보] — 시트를 닫고 상세 화면으로 이동한다(player-uiux.md 4.7, 추가 2026-08-23).
      재생은 유지되고 뒤로가기로 플레이어에 복귀한다(content-detail.md 2장) */
  const openDetail = () => {
    setIsMoreSheetVisible(false);
    navigation.navigate('Main', {
      screen: 'ContentDetail',
      params: { contentId, entryPoint: 'player' },
    });
  };

  /* ── 원문 보기(FR-12) — 클릭 기록과 브라우저 열기는 서로를 기다리지 않는다(player-api.md 4.5) ── */
  const openSourceLink = () => {
    const url = session?.meta.sourceUrl;
    if (!url) return;
    setIsMoreSheetVisible(false);
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
    navigation.goBack();
  };

  const collapse = () => navigation.goBack();

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
    // 원문·배너
    openSourceLink,
    retryLoad: () => playbackService.retryLoad(),
    retryUrlRefresh: () => playbackService.retryUrlRefresh(),
    closeWithdrawn,
    // 배속 시트
    isRateSheetVisible,
    openRateSheet: () => setIsRateSheetVisible(true),
    closeRateSheet: () => setIsRateSheetVisible(false),
    selectRate,
    // 더보기 시트
    isMoreSheetVisible,
    openMoreSheet: () => setIsMoreSheetVisible(true),
    closeMoreSheet: () => setIsMoreSheetVisible(false),
    openDetail,
    requestDelete,
    pendingDeleteItemId,
    undoDelete,
    // 재청취 창 밖 ▶의 확인 팝업(플레이어 호스트 — paywall.md 4.2 예외)
    playConfirm: playGate.confirmState,
    confirmPlay: playGate.confirmPlay,
    cancelPlayConfirm: playGate.cancelConfirm,
    suppressAndPlay: playGate.suppressAndPlay,
  };
};
