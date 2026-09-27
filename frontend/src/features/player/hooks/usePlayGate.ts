import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { track } from '@/shared/analytics';

import { PLAYER_COPY } from '../player.copy';
import type { PlaybackStartMeta, PlayEntryPoint, PlayStartResult } from '../player.types';
import { fetchQueueItems, queueKeys } from './useQueueQuery';
import { suppressPlayConfirmForToday } from '../services/play-confirm-suppression.service';
import { playbackService } from '../services/playback.service';
import { useLimitNoticeStore } from '../store/limit-notice.store';
import { usePlayLimitStore } from '../store/play-limit.store';
import { usePlaybackStore } from '../store/playback.store';

export interface PlayGateTarget {
  contentId: string;
  /** 팝업 여부 힌트(library-api.md 4.1). 판정이 아니다 — 최종 판단은 서버가 한다 */
  isCountedToday: boolean;
  /** 목록이 이미 들고 있는 메타 — 플레이어가 진입과 동시에 그린다(player-uiux.md 4.3) */
  meta?: PlaybackStartMeta;
  /** 완료 화면 ▶ 재청취 — 위치 0부터 재생 + replay 신호(player.md 5장) */
  restartFromBeginning?: boolean;
  /** CONTENT_WITHDRAWN(403) 시 진입점별 정리(목록 제거·미니플레이어 내림)에 쓴다 */
  onWithdrawn?: () => void;
  /** 발급 404 시 로드 실패 화면 대신 부른다 — 푸시 딥링크의 라이브러리 폴백용(playback.service `onNotFound`) */
  onNotFound?: () => void;
  /**
   * **발급이 성공한 뒤에 플레이어를 연다**(푸시 딥링크). 기본은 누르는 즉시 연다 — 목록에서 고른 재생은
   * 메타를 이미 들고 있어 빈 화면이 없다. 푸시는 아무것도 모르는 채로 들어오고, 없는·회수된 콘텐츠면 연
   * 플레이어를 곧바로 닫아야 하는데 **네이티브 모달을 뜨자마자 닫으면 iOS 에서 화면이 굳는다**
   * (2026-09-20 실기기). 재생 가능하다는 답을 받은 뒤에만 열면 닫을 일이 없다.
   */
  openAfterIssue?: boolean;
}

interface PlayGateOptions {
  /**
   * 재생 성공·회수·404 등 서버 상태가 바뀌었을 때 호출된다 — 진입점 화면이 자기 목록을
   * 재조회한다. player가 진입점의 쿼리 키를 알지 않기 위한 콜백 주입이다(architecture.md 4.3).
   */
  onServerStateChanged?: () => void;
  /**
   * 재생이 실제로 시작된 직후(200) 호출된다 — 탐색의 라이브러리 자동 적립(explore-api.md 4.6)
   * 같은 진입점 고유의 후속 처리용. 게이트가 진입점의 규칙을 알지 않기 위한 콜백 주입이다.
   */
  onPlayStarted?: (result: PlayStartResult, target: PlayGateTarget) => void;
}

interface ConfirmState {
  target: PlayGateTarget;
  entryPoint: PlayEntryPoint;
  /** 팝업에 적는 남은 횟수 — N = max(0, limit - count)는 화면이 계산한다(library-api.md 2) */
  remaining: number;
  /**
   * 발급을 이미 받아 둔 재생인가(푸시 딥링크 — `openAfterIssue`). [재생하기]는 새로 시작하지 않고 받아 둔
   * 세션을 재생하며, [취소]는 그 세션을 내린다(미니플레이어에 남기지 않는다).
   */
  isIssued: boolean;
}

/**
 * 재생 시작 게이트(architecture.md 5.2) — 라이브러리·탐색·미니플레이어·푸시가 전부 이
 * 게이트를 통과한다(paywall.md 4.2). 팝업을 띄울지는 클라이언트가 정하고, 재생을 허용할지는
 * 서버가 정한다.
 *
 * 통과하면 PlaybackService.start + 플레이어 진입이다. 서버 판정은 발급(audio-urls — 차감
 * 없음)과 실제 재생 시작(POST /play — 차감) 시점에 일어나고(paywall.md 4.3), 403 분기는
 * 플레이어 화면이 세션 상태로 받아 처리한다(player-api.md 5장 — 발급 시점이면 닫고 전환).
 */
export const usePlayGate = (options?: PlayGateOptions) => {
  const navigation = useNavigation();
  const showLimitNotice = useLimitNoticeStore((s) => s.show);
  const playLimit = usePlayLimitStore((s) => s.playLimit);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const queryClient = useQueryClient();

  /* TODO(paywall feature): 페이월 바텀시트(paywall.md 4.5)로 교체한다 */
  const openPaywall = (entry: PlayEntryPoint, message?: string) => {
    // MVP 는 안내 토스트지만 노출 자체가 퍼널의 끝점이다 — 바텀시트로 바뀌어도 같은 이벤트(analytics.md 3.4)
    track('paywall_view', { entry });
    // 토스트 대신 한도 안내 시트(2026-09-28 00:11) — 구독 UI 가 켜지면 이 시트가 페이월 자리다
    showLimitNotice(message);
  };

  const openPlayer = (contentId: string) => {
    navigation.navigate('Main', { screen: 'Player', params: { contentId } });
  };

  const startPlayback = (target: PlayGateTarget, entryPoint: PlayEntryPoint) => {
    playbackService.start({
      contentId: target.contentId,
      entryPoint,
      autoplay: true,
      restartFromBeginning: target.restartFromBeginning,
      meta: target.meta,
      callbacks: {
        onPlayStarted: options?.onPlayStarted
          ? (result) => options.onPlayStarted?.(result, target)
          : undefined,
        onServerStateChanged: () => options?.onServerStateChanged?.(),
        onWithdrawn: target.onWithdrawn,
        onNotFound: target.onNotFound,
      },
    });
    openPlayer(target.contentId);
  };

  /**
   * 차감이 일어날 재생이면 남은 횟수를, 아니면 null 을 돌려준다 — 팝업을 띄울지의 판단이다(library.md 4.3).
   * 값은 호출 시점의 store 에서 읽는다: 지연 경로(`startDeferred`)는 발급이 끝난 **뒤에** 부르므로 렌더 때
   * 잡아 둔 값을 쓰면 그 사이의 변화를 놓친다.
   */
  const remainingIfDeducting = (isCountedToday: boolean): number | null => {
    const { playLimit: limit, suppressedServiceDate: suppressed } = usePlayLimitStore.getState();
    if (limit === null || limit.dailyPlayLimit === null || limit.dailyPlayCount === null) return null;
    if (isCountedToday || suppressed === limit.serviceDate) return null;
    const remaining = Math.max(0, limit.dailyPlayLimit - limit.dailyPlayCount);
    return remaining > 0 ? remaining : null;
  };

  /** 서버가 준 잔여가 0 이고 이 편이 오늘 아직 차감 전인가 — 여는 순서를 정하는 힌트일 뿐 차단 판정은 아니다 */
  const isExhaustedHint = (isCountedToday: boolean): boolean => {
    const { playLimit: limit } = usePlayLimitStore.getState();
    if (isCountedToday || limit === null || limit.dailyPlayLimit === null || limit.dailyPlayCount === null) {
      return false;
    }
    return limit.dailyPlayLimit - limit.dailyPlayCount <= 0;
  };

  /**
   * 오늘 이미 재생한 콘텐츠인가 — 푸시는 이 힌트 없이 들어온다. 재생 목록(라이브러리 첫 페이지)에서 찾는다.
   * 못 찾거나 조회가 실패하면 "아직 안 들었다"로 본다 — 팝업이 한 번 더 뜰 뿐 차감 판정은 서버가 한다.
   */
  const lookUpIsCountedToday = async (contentId: string): Promise<boolean> => {
    try {
      const items = await queryClient.fetchQuery({
        queryKey: queueKeys.all,
        queryFn: fetchQueueItems,
        staleTime: 0,
      });
      return items.find((item) => item.contentId === contentId)?.isCountedToday ?? false;
    } catch {
      return false;
    }
  };

  /**
   * **발급 → (필요하면) 확인 팝업 → 재생** — 푸시 딥링크의 순서다(KAN-86). 푸시는 그 콘텐츠가 아직 있는지도,
   * 오늘 들었는지도 모르는 채로 들어온다. 종전 순서(팝업 → 발급)로는 없는 콘텐츠에 "오늘 N회 남았어요"를
   * 먼저 묻고 [재생하기]를 누른 뒤에야 "콘텐츠를 찾을 수 없어요"가 돌아왔다. 발급은 차감하지 않으므로
   * (차감은 소리가 난 시점의 `POST /play`) 팝업보다 앞서도 "동의 없이 차감하지 않는다"를 어기지 않는다.
   *
   * 플레이어도 발급이 성공한 뒤에만 연다 — 없는 콘텐츠로 네이티브 모달을 띄웠다 닫으면 iOS 에서 굳는다.
   */
  const startDeferred = (target: PlayGateTarget, entryPoint: PlayEntryPoint) => {
    const playIssued = () => {
      playbackService.playWhenReady();
      openPlayer(target.contentId);
    };
    playbackService.start({
      contentId: target.contentId,
      entryPoint,
      autoplay: false,
      restartFromBeginning: target.restartFromBeginning,
      meta: target.meta,
      callbacks: {
        onPlayStarted: options?.onPlayStarted
          ? (result) => options.onPlayStarted?.(result, target)
          : undefined,
        onServerStateChanged: () => options?.onServerStateChanged?.(),
        // 플레이어가 안 떠 있으면 회수 안내(PL9)를 그릴 화면이 없다 — 세션을 내리고 진입점에 맡긴다
        onWithdrawn: () => {
          playbackService.clearSession();
          target.onWithdrawn?.();
        },
        onNotFound: target.onNotFound,
        // 플레이어 화면이 하던 차단 처리(usePlayerScreen)를 여기서 대신한다 — 같은 문구·같은 분기다
        onIssueBlocked: (blocked) => {
          if (blocked.kind === 'paywall') openPaywall(entryPoint, blocked.message ?? undefined);
          else showLimitNotice(blocked.message ?? PLAYER_COPY.paidLimitReachedToast);
        },
        onIssued: ({ isReusedSession }) => {
          // 이미 재생을 기록한 세션을 이어 듣는 것이면 새로 차감되지 않는다 — 묻지 않는다
          if (isReusedSession) {
            playIssued();
            return;
          }
          void lookUpIsCountedToday(target.contentId).then((isCountedToday) => {
            // 조회하는 사이에 다른 재생으로 넘어갔으면 이 알림의 몫은 끝났다
            if (usePlaybackStore.getState().session?.contentId !== target.contentId) return;
            const remaining = remainingIfDeducting(isCountedToday);
            if (remaining === null) playIssued();
            else setConfirmState({ target, entryPoint, remaining, isIssued: true });
          });
        },
      },
    });
  };

  /**
   * 진입점 공통의 재생 요청. 차감이 실제로 일어나는 재생에만 팝업을 띄운다(library.md 4.3).
   * 소진(잔여 0) 힌트라도 클라이언트가 차단하지 않는다 — 다만 플레이어를 먼저 열지 않고 발급부터 받아, 403 이면
   * 플레이어 없이 페이월 안내, 허용이면 그때 연다(경합·힌트 노후를 서버 판정이 흡수한다, 2026-09-28).
   */
  const requestPlay = (target: PlayGateTarget, entryPoint: PlayEntryPoint) => {
    // 소진 힌트(서버가 준 잔여 0)면 **플레이어를 먼저 열지 않고** 발급부터 받는다 — 403(한도)이면 플레이어 없이 바로 페이월
    // 안내가 뜨고, 서버가 허용하면(힌트가 낡았거나 오늘 이미 들은 편) 그때 연다. 종전엔 플레이어가 떴다가 "오늘 이미 다
    // 들었어요"로 닫혔다(PM 2026-09-28 00:01). 차단 판정은 여전히 서버다 — 클라이언트는 여는 순서만 바꾼다
    if (target.openAfterIssue === true || isExhaustedHint(target.isCountedToday)) {
      startDeferred(target, entryPoint);
      return;
    }
    const remaining = remainingIfDeducting(target.isCountedToday);
    if (remaining !== null) {
      setConfirmState({ target, entryPoint, remaining, isIssued: false });
      return;
    }
    startPlayback(target, entryPoint);
  };

  /** 팝업을 통과한 재생 — 발급을 받아 둔 재생이면 그 세션을 재생하고, 아니면 지금 시작한다 */
  const proceed = (state: ConfirmState) => {
    if (state.isIssued) {
      playbackService.playWhenReady();
      openPlayer(state.target.contentId);
      return;
    }
    startPlayback(state.target, state.entryPoint);
  };

  /** [재생하기] — 허용 여부는 발급·재생 시작 시점에 서버가 다시 판정한다(paywall.md 4.2) */
  const confirmPlay = () => {
    if (!confirmState) return;
    track('play_confirm', { action: 'confirm', remaining: confirmState.remaining });
    setConfirmState(null);
    proceed(confirmState);
  };

  /** [취소] — 차감도 없고 억제도 걸리지 않는다(library-uiux.md 4.6) */
  const cancelConfirm = () => {
    if (!confirmState) return;
    track('play_confirm', { action: 'cancel', remaining: confirmState.remaining });
    // 발급만 받아 둔 세션은 내린다 — 듣지 않기로 한 콘텐츠가 미니플레이어에 남지 않게
    if (confirmState.isIssued) playbackService.clearSession();
    setConfirmState(null);
  };

  /** [오늘은 그만 보기] — 팝업을 닫고 그대로 재생한다. 차감은 그대로 일어난다(library.md 4.3) */
  const suppressAndPlay = () => {
    if (!confirmState) return;
    track('play_confirm', { action: 'suppress_today', remaining: confirmState.remaining });
    if (playLimit) void suppressPlayConfirmForToday(playLimit.serviceDate);
    setConfirmState(null);
    proceed(confirmState);
  };

  return {
    confirmState,
    requestPlay,
    confirmPlay,
    cancelConfirm,
    suppressAndPlay,
    openPaywall,
  };
};
