import { create } from 'zustand';

/** 미니플레이어 카드의 화면(window) 좌표 — 플레이어 열림·닫힘 모션의 도착·출발 지점이다(2026-09-16) */
export interface MiniPlayerLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MiniPlayerLayoutStore {
  layout: MiniPlayerLayout | null;
  setLayout: (layout: MiniPlayerLayout | null) => void;
}

/**
 * 미니플레이어가 자기 위치를 실측해 올려 두고, 플레이어 화면이 읽는다.
 * 플레이어는 투명 모달로 라이브러리 위에 얹히므로 두 화면의 좌표계가 같다 — 아트워크·제목이
 * 미니플레이어의 썸네일·제목 자리로 정확히 내려앉을 수 있다.
 */
export const useMiniPlayerLayoutStore = create<MiniPlayerLayoutStore>((set) => ({
  layout: null,
  setLayout: (layout) => set({ layout }),
}));
