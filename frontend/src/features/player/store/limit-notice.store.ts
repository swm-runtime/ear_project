import { create } from 'zustand';

interface LimitNoticeStore {
  isVisible: boolean;
  /** 서버가 준 안내 문구(있으면) — 없으면 확정 카피 */
  message: string | null;
  /**
   * 페이월 자리로 열렸는가 — 무료 한도 소진(paywall.md 4.5). 유료 한도 안내(최상위 티어 LIMIT_REACHED)는 false —
   * 요금제 비교를 얹지 않는다. 구독 UI 가 꺼진 바이너리에서는 어느 쪽이든 한도 안내만 보인다
   */
  isPaywall: boolean;
  /**
   * 결제 후 막혔던 콘텐츠를 다시 트는 함수(paywall.md 4.5-5 · architecture.md 6.5) — 재생 게이트가 넣는다.
   * 결제 쪽(subscription)은 이 함수의 내용을 모른다. [닫기]하면 버린다(blocked_content_id 폐기)
   */
  resume: (() => void) | null;
  /**
   * 잔여 링을 눌러 열었고 아직 남은 횟수가 있다 — 시트가 "N회 더 들을 수 있어요" 갈래로 그린다(2026-10-28).
   * 한도 소진·재생 차단으로 열리면 null(종전 "모두 사용했어요")
   */
  remaining: { remaining: number; limit: number } | null;
  /** 이메일 인증을 다녀오는 동안 내려 둔 상태 — 다시 열면 같은 페이월(막힌 콘텐츠 포함)이 뜬다 */
  isSuspended: boolean;
  show: (message?: string | null) => void;
  showPaywall: (
    message?: string | null,
    resume?: (() => void) | null,
    remaining?: { remaining: number; limit: number } | null,
  ) => void;
  hide: () => void;
  suspend: () => void;
  reopen: () => void;
}

/**
 * 한도 안내 시트(LimitNoticeSheet)의 열림 상태 — 앱 루트에 하나만 있고 어디서든 연다(토스트와 같은 방식).
 * 재생 게이트·플레이어가 "오늘 한도 소진"을 받으면 연다(PM 2026-09-28 00:11 — 토스트 대신 시트)
 */
export const useLimitNoticeStore = create<LimitNoticeStore>((set) => ({
  isVisible: false,
  message: null,
  isPaywall: false,
  resume: null,
  remaining: null,
  isSuspended: false,
  show: (message) =>
    set({
      isVisible: true,
      message: message ?? null,
      isPaywall: false,
      resume: null,
      remaining: null,
      isSuspended: false,
    }),
  showPaywall: (message, resume, remaining) =>
    set({
      isVisible: true,
      message: message ?? null,
      isPaywall: true,
      resume: resume ?? null,
      remaining: remaining ?? null,
      isSuspended: false,
    }),
  hide: () => set({ isVisible: false, resume: null, isSuspended: false }),
  suspend: () => set({ isVisible: false, isSuspended: true }),
  reopen: () =>
    set((state) => (state.isSuspended ? { isVisible: true, isSuspended: false } : state)),
}));
