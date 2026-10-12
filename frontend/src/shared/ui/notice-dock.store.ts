import { create } from 'zustand';

/** 화면 창 좌표와 실제 탭 높이로 안내의 하단 여백을 구한다. */
export const floatingNoticeBottom = (
  windowHeight: number,
  miniTop: number | null,
  tabBarHeight: number,
  safeBottom: number,
): number => Math.max(safeBottom, tabBarHeight, miniTop === null ? 0 : windowHeight - miniTop) + 8;

interface NoticeDockStore {
  insets: Record<string, number>;
  bottom: number;
  set: (owner: string, bottom: number | null) => void;
}

/** 포커스된 화면만 등록한다. 제자리 검색처럼 두 호스트가 겹쳐도 해제 순서에 영향받지 않는다. */
export const useNoticeDockStore = create<NoticeDockStore>((set) => ({
  insets: {},
  bottom: 0,
  set: (owner, bottom) =>
    set((state) => {
      const insets = { ...state.insets };
      if (bottom === null) delete insets[owner];
      else insets[owner] = bottom;
      return { insets, bottom: Math.max(0, ...Object.values(insets)) };
    }),
}));
