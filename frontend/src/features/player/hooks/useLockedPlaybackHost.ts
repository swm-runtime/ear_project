import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { PLAYER_COPY } from '../player.copy';
import { usePlayGate, type PlayGateTarget } from './usePlayGate';
import { playbackService } from '../services/playback.service';
import { useLimitNoticeStore } from '../store/limit-notice.store';
import { usePlaybackStore } from '../store/playback.store';

/** 앱이 앞에 있는가 — 화면 밖에서 생긴 안내를 앱이 앞으로 올 때 띄우려고 쓴다 */
export const useIsAppActive = (): boolean => {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setIsActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return isActive;
};

/**
 * 자동 재생이 잠긴 다음 편 앞에서 멈춘 기록(KAN-302)을 꺼낸다 — 꺼내면 지운다(호스트 둘이 한 번만 띄우게). 그사이 다른 편을 틀었거나
 * 다시 듣기를 눌렀으면 몫이 끝났으므로 null. 돌려주는 대상은 잠금 힌트를 단 채라 게이트가 발급 없이 시트만 띄우고, 결제 뒤에는
 * 힌트를 떼고 같은 목록 맥락으로 다시 요청한다
 */
export const takeLockedNextTarget = (): PlayGateTarget | null => {
  const state = usePlaybackStore.getState();
  const pending = state.lockedNext;
  if (pending === null) return null;
  state.setLockedNext(null);
  const session = state.session;
  if (session === null || session.contentId !== pending.afterContentId || session.state !== 'ended')
    return null;
  const { entry } = pending;
  return {
    contentId: entry.contentId,
    isCountedToday: entry.isCountedToday,
    isLocked: true,
    meta: {
      title: entry.title,
      authorName: entry.authorName ?? undefined,
      sourceName: entry.sourceName ?? undefined,
      thumbnailUrl: entry.thumbnailUrl ?? undefined,
      durationSec: entry.durationSec ?? undefined,
      topicIds: entry.topicIds,
    },
    queue: pending.queue,
  };
};

/**
 * 플레이어가 **안 떠 있을 때**의 재생 차단을 시트로 잇는다(KAN-302) — MainNavigator 에 하나만 단다. 플레이어가 떠 있으면 그 화면
 * (usePlayerScreen)이 같은 일을 한다.
 *
 * 1. 세션이 `blocked` — 미니플레이어 상태에서 듣던 편의 URL 갱신·재생 시작이 403(잠김 `SERIES_EPISODE_LOCKED` · 한도)으로 막혔다.
 *    종전엔 미니플레이어만 사라지고 아무것도 뜨지 않았다. 세션을 내리고 플레이어 화면과 같은 시트(잠금 · 페이월 · 한도 안내)를 띄운다.
 * 2. 자동 재생이 잠긴 다음 편 앞에서 멈췄다 — 건너뛰지 않고 잠금 시트(결정 2026-10-30 박준현). 화면 밖에서 끝났으면 앱이 앞으로
 *    올 때 띄운다. 듣던 편 세션은 남긴다 — 미니플레이어에 끝난 편이 그대로 있다
 */
export const useLockedPlaybackHost = (
  isPlayerOpen: boolean,
): Pick<
  ReturnType<typeof usePlayGate>,
  'confirmState' | 'confirmPlay' | 'cancelConfirm' | 'suppressAndPlay'
> => {
  const playGate = usePlayGate();
  const blocked = usePlaybackStore((s) =>
    s.session?.state === 'blocked' ? s.session.blocked : null,
  );
  const lockedNext = usePlaybackStore((s) => s.lockedNext);
  const isAppActive = useIsAppActive();

  useEffect(() => {
    if (blocked === null || isPlayerOpen) return;
    const { session, queueContext } = usePlaybackStore.getState();
    if (session === null) return;
    // 결제 뒤 다시 틀 편 — 세션을 내리기 전에 잡아 둔다. 재생 목록 맥락도 함께(usePlayerScreen 과 같다)
    const target: PlayGateTarget = {
      contentId: session.contentId,
      isCountedToday: false,
      queue: queueContext,
    };
    playbackService.clearSession();
    if (blocked.kind === 'series_locked') {
      playGate.openSeriesLock('miniplayer', blocked.message ?? undefined, target);
    } else if (blocked.kind === 'paywall') {
      playGate.openPaywall('miniplayer', blocked.message ?? undefined, target);
    } else {
      useLimitNoticeStore.getState().show(blocked.message ?? PLAYER_COPY.paidLimitReachedToast);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blocked 전이와 플레이어 열림 여부에만 반응한다
  }, [blocked, isPlayerOpen]);

  useEffect(() => {
    if (lockedNext === null || isPlayerOpen || !isAppActive) return;
    const target = takeLockedNextTarget();
    if (target === null) return;
    playGate.openSeriesLock('player', undefined, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록이 생기거나 앱이 앞으로 온 때에만 반응한다
  }, [lockedNext, isPlayerOpen, isAppActive]);

  // 결제 뒤 이어 재생이 차감되는 재생이면(데일리 등 한도가 있는 요금제) 이 게이트가 확인 팝업을 띄운다 — 호스트가 그린다
  const { confirmState, confirmPlay, cancelConfirm, suppressAndPlay } = playGate;
  return { confirmState, confirmPlay, cancelConfirm, suppressAndPlay };
};
