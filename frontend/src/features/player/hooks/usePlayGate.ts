import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useToastStore } from '@/shared/ui/toast.store';

import { PLAYER_COPY } from '../player.copy';
import type { PlayEntryPoint, PlayStartResult } from '../player.types';
import { useStartPlayMutation } from './useStartPlayMutation';
import { suppressPlayConfirmForToday } from '../services/play-confirm-suppression.service';
import { usePlayLimitStore } from '../store/play-limit.store';

export interface PlayGateTarget {
  contentId: string;
  /** 팝업 여부 힌트(library-api.md 4.1). 판정이 아니다 — 최종 판단은 서버가 한다 */
  isCountedToday: boolean;
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
 * 서버가 정한다(library-api.md 6장).
 */
export const usePlayGate = (options?: PlayGateOptions) => {
  const navigation = useNavigation();
  const showToast = useToastStore((s) => s.show);
  const playLimit = usePlayLimitStore((s) => s.playLimit);
  const suppressedServiceDate = usePlayLimitStore((s) => s.suppressedServiceDate);
  const applyPlayLimit = usePlayLimitStore((s) => s.applyPlayLimit);
  const startPlayMutation = useStartPlayMutation();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const notifyServerStateChanged = () => options?.onServerStateChanged?.();

  /* TODO(paywall feature): 페이월 바텀시트(paywall.md 4.5)로 교체한다 */
  const openPaywall = (message?: string) => {
    showToast(message ?? PLAYER_COPY.paywallPlaceholderToast);
  };

  const startPlayback = (target: PlayGateTarget, entryPoint: PlayEntryPoint) => {
    if (startPlayMutation.isPending) return;
    startPlayMutation.mutate(
      { contentId: target.contentId, entryPoint },
      {
        onSuccess: (result) => {
          // 표시값은 적재 이후의 서버 값으로 덮어쓴다 — 클라이언트가 1을 빼지 않는다
          applyPlayLimit(result.playLimit);
          options?.onPlayStarted?.(result, target);
          // 상태 전이(unplayed→in_progress)·카운트 반영은 진입점 화면의 재조회로 맞춘다
          notifyServerStateChanged();
          navigation.navigate('Main', {
            screen: 'Player',
            params: { contentId: target.contentId },
          });
        },
        onError: (error) => {
          if (isApiError(error)) {
            switch (error.errorCode) {
              case ERROR_CODES.PLAY_LIMIT_EXCEEDED:
                // 무료 한도 소진 — 페이월(library-api.md 5장). 확인 팝업과 연달아 띄우지 않는다
                openPaywall(error.message);
                return;
              case ERROR_CODES.PLAY_LIMIT_REACHED:
                // 한도 있는 유료 티어 — 페이월이 아니라 안내다
                showToast(PLAYER_COPY.paidLimitReachedToast);
                return;
              case ERROR_CODES.CONTENT_WITHDRAWN:
                showToast(PLAYER_COPY.withdrawnToast);
                target.onWithdrawn?.();
                notifyServerStateChanged();
                return;
              case ERROR_CODES.CONTENT_NOT_FOUND:
                notifyServerStateChanged();
                return;
              default:
                showToast(error.message);
                return;
            }
          }
          showToast(PLAYER_COPY.playFailedToast);
        },
      },
    );
  };

  /**
   * 진입점 공통의 재생 요청. 차감이 실제로 일어나는 재생에만 팝업을 띄운다(library.md 4.3).
   * 소진(잔여 0) 힌트라도 클라이언트가 차단하지 않는다 — 그대로 요청해 403이면 페이월로 간다.
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

  /** [재생하기] — 누른 시점에 서버가 다시 판정한다. 팝업의 숫자를 근거로 통과시키지 않는다 */
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
    isStartingPlay: startPlayMutation.isPending,
  };
};
