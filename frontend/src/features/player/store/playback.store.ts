/**
 * 전역 재생 상태(architecture.md 7.1 — 클라이언트 전역 상태). 쓰기는 PlaybackService만 하고
 * 플레이어 화면·미니플레이어는 selector로 구독만 한다(convention.md 4.2 — 전체 구독 금지:
 * 위치가 0.5초마다 갱신된다).
 */
import { create } from 'zustand';

import type { PlaybackRate } from '@/features/settings';

import type { PlaybackSession, PlayQueueContext } from '../player.types';

const LIBRARY_QUEUE_CONTEXT: PlayQueueContext = { kind: 'library' };

interface PlaybackStore {
  session: PlaybackSession | null;
  /**
   * 재생 목록의 맥락(KAN-241) — 게이트가 재생을 시작할 때 쓴다. 메모리뿐이다: 앱을 다시 켜 복원한 재생은
   * 라이브러리 맥락이다(스냅샷을 디스크에 남기지 않는다 — 낡은 목록이 "지금 들어온 맥락"으로 둔갑하지 않게)
   */
  queueContext: PlayQueueContext;
  /**
   * 전역 배속(user_settings.default_playback_rate의 클라이언트 사본).
   * 저장소 진실은 서버다 — 화면 진입 시 settings 조회로 채우고, 변경 시 서버에 비동기 저장한다.
   */
  rate: PlaybackRate;
  /** 서버 값으로 한 번 채웠는가 — 사용자가 먼저 바꿨으면 서버 값으로 덮지 않는다 */
  isRateHydrated: boolean;
  /**
   * 미니플레이어 스와이프 종료 상태(player-uiux.md 4.8) — 이번 실행에서 새 재생이 시작될
   * 때까지 복원 폴백도 다시 띄우지 않는다. 다음 실행의 복원 판정에는 영향이 없다(로컬 비영속).
   */
  isMiniPlayerDismissed: boolean;
  setSession: (session: PlaybackSession | null) => void;
  patchSession: (patch: Partial<PlaybackSession>) => void;
  setRate: (rate: PlaybackRate) => void;
  markRateHydrated: () => void;
  setMiniPlayerDismissed: (dismissed: boolean) => void;
  setQueueContext: (context: PlayQueueContext) => void;
}

export const usePlaybackStore = create<PlaybackStore>((set) => ({
  session: null,
  queueContext: LIBRARY_QUEUE_CONTEXT,
  rate: 1.0,
  isRateHydrated: false,
  isMiniPlayerDismissed: false,
  setSession: (session) => set({ session }),
  patchSession: (patch) =>
    set((prev) => (prev.session ? { session: { ...prev.session, ...patch } } : prev)),
  setRate: (rate) => set({ rate, isRateHydrated: true }),
  markRateHydrated: () => set({ isRateHydrated: true }),
  setMiniPlayerDismissed: (dismissed) => set({ isMiniPlayerDismissed: dismissed }),
  setQueueContext: (queueContext) => set({ queueContext }),
}));
