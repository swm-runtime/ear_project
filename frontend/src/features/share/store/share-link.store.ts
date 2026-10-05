import { create } from 'zustand';

/**
 * 공유 링크가 보는 실행 관문의 상태(share.md 4.3) — 호출부(app의 RootNavigator)가 루트 분기에서
 * 알려 준다. share 는 관문을 직접 판정하지 않는다(판정 재료가 버전·세션·재동의·온보딩·스플래시에 흩어져 있다).
 *
 * | 값 | 뜻 |
 * |---|---|
 * | `pending` | 관문 판정 중 — 스플래시가 떠 있다(버전 확인·세션 복원·로고 모션·마지막 탭 읽기) |
 * | `open` | 관문을 전부 통과했다 — Main 이 떠 있다(로그인·재동의 없음·온보딩 완료) |
 * | `closed` | 관문에서 걸렸다 — 시작 화면·재동의·온보딩·강제 업데이트 중 하나다 |
 */
export type ShareLinkGate = 'pending' | 'open' | 'closed';

interface ShareLinkStore {
  /** 관문 판정을 기다리는 목적지 — 콜드 스타트나 스플래시 도중에 도착한 링크 */
  waitingContentId: string | null;
  /** 관문을 통과해 Main 이 집어 갈 목적지(`useShareLinkLanding`) */
  landingContentId: string | null;
  /** 링크 하나를 받는다 — 판정 중이면 기다리고, 판정이 끝났으면 그 자리에서 가른다 */
  receive: (contentId: string, gate: ShareLinkGate) => void;
  /**
   * 관문 판정이 끝났다 — 기다리던 목적지를 **한 번만** 가른다. 판정 뒤에는 기다리는 것이 없으므로
   * 이후 로그인·온보딩 완료로 관문이 바뀌어도 되살리지 않는다(디퍼드 딥링크 금지, share.md 4.3)
   */
  settle: (gate: ShareLinkGate) => void;
  /** Main 이 목적지를 집었다 — 비워서 한 번만 이동한다 */
  clearLanding: () => void;
}

export const useShareLinkStore = create<ShareLinkStore>((set, get) => ({
  waitingContentId: null,
  landingContentId: null,
  receive: (contentId, gate) => {
    if (gate === 'pending') {
      // 판정 중에 링크가 둘 오면 나중 것이 이긴다 — 사용자가 마지막으로 누른 링크다
      set({ waitingContentId: contentId });
      return;
    }
    // 관문에서 걸렸으면 버린다 — 정상 진입 분기를 따를 뿐 안내도 없다(share-uiux.md 4.4)
    if (gate === 'open') set({ landingContentId: contentId });
  },
  settle: (gate) => {
    if (gate === 'pending') return;
    if (gate === 'closed') {
      // 집히지 않은 목적지도 함께 버린다 — 다음에 Main 이 뜰 때(로그인 뒤) 복원되면 안 된다
      set({ waitingContentId: null, landingContentId: null });
      return;
    }
    const waiting = get().waitingContentId;
    if (waiting === null) return;
    set({ waitingContentId: null, landingContentId: waiting });
  },
  clearLanding: () => set({ landingContentId: null }),
}));
