import { create } from 'zustand';

interface TabSelectionStore {
  /** 지금 선택된 탭 */
  selected: string | null;
  /** 직전에 선택돼 있던 탭 — 제목 줄 알약이 어느 모양에서 출발할지 정한다 */
  previous: string | null;
  select: (tab: string) => void;
}

/**
 * 선택된 탭 — **탭 내비게이터가 직접 써 넣는다**(`NativeMainTabs` 의 `screenListeners.state`).
 *
 * 알약 모핑이 이 값을 본다. 화면 쪽에서 포커스·blur 이벤트로 판정하던 것을 걷어낸 이유(2026-09-28 04:55):
 *
 * - 포커스는 **계층적**이라 플레이어 같은 모달이 탭을 덮어도 탭 화면이 blur 된다 — 탭 이동과 구분되지 않는다.
 * - blur 시점에 선택된 탭이 이미 다음 탭인지 아직 이전 탭인지가 보장되지 않는다.
 * - 알약은 시스템 내비게이션 바의 바 버튼 안에서 그려지는데(02:53 부터), 그 안에서 내비게이션 이벤트가
 *   기대대로 오는지 확인할 방법이 없었다.
 *
 * 반면 이 `state` 리스너는 **이미 동작이 확인된 신호**다 — 마지막 탭 기억(`rememberTab`)이 같은 자리에서 돌아간다.
 * 모달은 탭 상태를 바꾸지 않으므로 "모달이 덮으면 알약이 움직인다"에도 저절로 면역이다.
 */
export const useTabSelectionStore = create<TabSelectionStore>((set) => ({
  selected: null,
  previous: null,
  select: (tab) => set((s) => (s.selected === tab ? s : { previous: s.selected, selected: tab })),
}));

/** 리스너에서 부른다(렌더 밖) */
export const selectTab = (tab: string): void => useTabSelectionStore.getState().select(tab);
