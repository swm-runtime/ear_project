import { create } from 'zustand';

interface ScrubPositionStore {
  /** 재생 바를 잡고 끄는 동안 손가락 아래 위치(초). 잡고 있지 않으면 null */
  scrubSec: number | null;
  setScrubSec: (sec: number | null) => void;
}

/**
 * 재생 바를 끄는 위치 — 구간 카드가 끄는 동안 그 위치의 구간을 미리 보여 준다(애플 팟캐스트, PM 2026-10-07).
 * 화면 상태로 두면 끄는 동안 플레이어 화면 전체가 프레임마다 다시 그려져 — 카드만 구독하도록 작은 저장소로 둔다
 */
export const useScrubPositionStore = create<ScrubPositionStore>((set) => ({
  scrubSec: null,
  setScrubSec: (scrubSec) => set({ scrubSec }),
}));
