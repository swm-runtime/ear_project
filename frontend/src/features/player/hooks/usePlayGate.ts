import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';

import { useToastStore } from '@/shared/ui/toast.store';

import { PLAYER_COPY } from '../player.copy';
import type { PlaybackStartMeta, PlayEntryPoint, PlayStartResult } from '../player.types';
import { suppressPlayConfirmForToday } from '../services/play-confirm-suppression.service';
import { playbackService } from '../services/playback.service';
import { usePlayLimitStore } from '../store/play-limit.store';

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
  const showToast = useToastStore((s) => s.show);
  const playLimit = usePlayLimitStore((s) => s.playLimit);
  const suppressedServiceDate = usePlayLimitStore((s) => s.suppressedServiceDate);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  /* TODO(paywall feature): 페이월 바텀시트(paywall.md 4.5)로 교체한다 */
  const openPaywall = (message?: string) => {
    showToast(message ?? PLAYER_COPY.paywallPlaceholderToast);
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
      },
    });
    navigation.navigate('Main', {
      screen: 'Player',
      params: { contentId: target.contentId },
    });
  };

  /**
   * 진입점 공통의 재생 요청. 차감이 실제로 일어나는 재생에만 팝업을 띄운다(library.md 4.3).
   * 소진(잔여 0) 힌트라도 클라이언트가 차단하지 않는다 — 그대로 진입해 발급 403이면
   * 플레이어가 닫고 페이월로 전환한다(경합·힌트 노후를 서버 판정이 흡수한다).
   */
  const requestPlay = (target: PlayGateTarget, entryPoint: PlayEntryPoint) => {
    const wouldDeduct =
      playLimit !== null &&
      playLimit.dailyPlayLimit !== null &&
      playLimit.dailyPlayCount !== null &&
      !target.isCountedToday;
    const isSuppressed = playLimit !== null && suppressedServiceDate === playLimit.serviceDate;

    if (wouldDeduct && !isSuppressed) {
      const remaining = Math.max(
        0,
        (playLimit.dailyPlayLimit ?? 0) - (playLimit.dailyPlayCount ?? 0),
      );
      if (remaining > 0) {
        setConfirmState({ target, entryPoint, remaining });
        return;
      }
    }
    startPlayback(target, entryPoint);
  };

  /** [재생하기] — 허용 여부는 발급·재생 시작 시점에 서버가 다시 판정한다(paywall.md 4.2) */
  const confirmPlay = () => {
    if (!confirmState) return;
    setConfirmState(null);
    startPlayback(confirmState.target, confirmState.entryPoint);
  };

  /** [취소] — 차감도 없고 억제도 걸리지 않는다(library-uiux.md 4.6) */
  const cancelConfirm = () => setConfirmState(null);

  /** [오늘은 그만 보기] — 팝업을 닫고 그대로 재생한다. 차감은 그대로 일어난다(library.md 4.3) */
  const suppressAndPlay = () => {
    if (!confirmState) return;
    if (playLimit) void suppressPlayConfirmForToday(playLimit.serviceDate);
    setConfirmState(null);
    startPlayback(confirmState.target, confirmState.entryPoint);
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
