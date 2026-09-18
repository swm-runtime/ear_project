import { create } from 'zustand';

/**
 * 미니플레이어를 끌어올려 여는 제스처의 단계(2026-09-18).
 * - `idle`     제스처 없음 — 플레이어는 평소처럼 스스로 열린다(탭).
 * - `dragging` 손가락이 미니플레이어를 잡고 있다 — 플레이어는 `progress`를 그대로 따른다.
 * - `open`     놓았고, 끝까지 연다.
 * - `cancel`   놓았고, 미니플레이어로 되돌린 뒤 화면을 걷는다.
 */
export type PlayerOpenGesturePhase = 'idle' | 'dragging' | 'open' | 'cancel';

interface PlayerOpenGestureStore {
  phase: PlayerOpenGesturePhase;
  /** 0(미니플레이어 자리) ~ 1(풀 화면) — 플레이어의 openProgress 에 그대로 들어간다 */
  progress: number;
  begin: () => void;
  update: (progress: number) => void;
  release: (phase: 'open' | 'cancel') => void;
  reset: () => void;
}

/**
 * 제스처는 미니플레이어(탭 화면)가 쥐고, 모션은 플레이어 화면(투명 모달)이 그린다 — 두 화면을 잇는 통로다.
 * 끌기 시작하면 미니플레이어가 플레이어를 띄우고 여기에 진행도를 올리며, 플레이어는 구독해 openProgress 로 옮긴다.
 * 플레이어가 준비(실측·이미지)되기 전에 놓아도 단계가 남아 있어 준비되는 순간 이어서 처리한다.
 */
export const usePlayerOpenGestureStore = create<PlayerOpenGestureStore>((set) => ({
  phase: 'idle',
  progress: 0,
  begin: () => set({ phase: 'dragging', progress: 0 }),
  update: (progress) => set({ progress }),
  release: (phase) => set({ phase }),
  reset: () => set({ phase: 'idle', progress: 0 }),
}));
