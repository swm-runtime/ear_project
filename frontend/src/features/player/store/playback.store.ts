/**
 * 전역 재생 상태(architecture.md 7.1 — 클라이언트 전역 상태). 쓰기는 PlaybackService만 하고
 * 플레이어 화면·미니플레이어는 selector로 구독만 한다(convention.md 4.2 — 전체 구독 금지:
 * 위치가 0.5초마다 갱신된다).
 */
import { create } from 'zustand';

import type { PlaybackRate } from '@/features/settings';

import type { PlaybackSession, PlayQueueContext, QueueEntry } from '../player.types';

/**
 * 자동 재생이 **잠긴 다음 편 앞에서 멈췄다**(KAN-302 — 결정 2026-10-30 박준현). 건너뛰지 않고 잠금 시트(PW2)를 띄운다 — 화면이 앞에
 * 있을 때 호스트(useLockedPlaybackHost · 열린 플레이어)가 꺼내 쓴다. 화면 밖에서 끝났으면 앱이 앞으로 올 때까지 기다린다
 */
export interface LockedNextPending {
  /** 끝난 편 — 그사이 다른 편을 틀었거나 다시 듣기를 눌렀으면 이 기록의 몫은 끝났다 */
  afterContentId: string;
  /** 잠긴 다음 줄 — 결제하면 이 편을 이어서 튼다 */
  entry: QueueEntry;
  /** 멈춘 순간의 재생 목록 맥락 — 결제 뒤 다시 틀어도 같은 목록이다 */
  queue: PlayQueueContext;
}

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
  /**
   * **멈춘 채 연 푸시 콘텐츠**(KAN-273) — 발급만 받아 두고 아직 소리가 난 적 없는 편. 이 편의 첫 ▶는 바로 재생하지 않고
   * 재생 게이트의 확인 팝업을 거친다(차감되는 재생이면). 소리가 나면(서비스) 지운다
   */
  confirmBeforePlayContentId: string | null;
  lockedNext: LockedNextPending | null;
  setSession: (session: PlaybackSession | null) => void;
  patchSession: (patch: Partial<PlaybackSession>) => void;
  setRate: (rate: PlaybackRate) => void;
  markRateHydrated: () => void;
  setMiniPlayerDismissed: (dismissed: boolean) => void;
  setQueueContext: (context: PlayQueueContext) => void;
  setConfirmBeforePlay: (contentId: string | null) => void;
  setLockedNext: (pending: LockedNextPending | null) => void;
}

export const usePlaybackStore = create<PlaybackStore>((set) => ({
  session: null,
  queueContext: LIBRARY_QUEUE_CONTEXT,
  rate: 1.0,
  isRateHydrated: false,
  isMiniPlayerDismissed: false,
  confirmBeforePlayContentId: null,
  lockedNext: null,
  setSession: (session) => set({ session }),
  patchSession: (patch) =>
    set((prev) => (prev.session ? { session: { ...prev.session, ...patch } } : prev)),
  setRate: (rate) => set({ rate, isRateHydrated: true }),
  markRateHydrated: () => set({ isRateHydrated: true }),
  setMiniPlayerDismissed: (dismissed) => set({ isMiniPlayerDismissed: dismissed }),
  setQueueContext: (queueContext) => set({ queueContext }),
  setConfirmBeforePlay: (confirmBeforePlayContentId) => set({ confirmBeforePlayContentId }),
  setLockedNext: (lockedNext) => set({ lockedNext }),
}));
