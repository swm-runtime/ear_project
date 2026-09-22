import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';
import { create } from 'zustand';

/** 캡슐 탭 바 · 미니플레이어 카드 · 목록 사이의 간격(MiniPlayer 의 DOCK_GAP 과 같다) */
const DOCK_GAP = 8;

/** 미니플레이어 카드의 화면(window) 좌표 — 플레이어 열림·닫힘 모션의 도착·출발 지점이다(2026-09-16) */
export interface MiniPlayerLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 썸네일 실측(window 좌표) — 모션의 아트워크가 정확히 이 자리에 내려앉는다. 없으면 상수로 추정한다 */
  thumb?: { x: number; y: number; size: number };
  /** 제목 텍스트 실측(window 좌표) */
  title?: { x: number; y: number; width: number; height: number };
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

/**
 * 미니플레이어가 목록 위에 떠 있는 만큼 목록 바닥에 남길 여백(2026-09-22 PM — 미니플레이어를 목록 위에 띄움).
 * 안 보이면 0. 목록 화면은 이 값을 contentContainerStyle 의 paddingBottom 으로 준다
 */
export const useMiniPlayerInset = (): number =>
  useMiniPlayerLayoutStore((s) => s.layout?.height ?? 0);

/**
 * 목록 바닥에 남길 여백 전체 = 떠 있는 탭 바 높이(탭 밖에서는 0) + 미니플레이어 높이. 탭 바도 목록 위에
 * 떠 있으므로(MainNavigator, 2026-09-22) 목록 화면은 이 값을 contentContainerStyle 의 paddingBottom 으로 준다
 */
export const useBottomDockInset = (): number => {
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const miniHeight = useMiniPlayerInset();
  // 카드가 있으면 캡슐과의 간격 + 카드 + 목록과의 간격, 없으면 캡슐 위 간격만
  return tabBarHeight + (miniHeight > 0 ? DOCK_GAP + miniHeight : 0) + DOCK_GAP;
};
