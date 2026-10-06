import { create } from 'zustand';

import type { PurchasePhase } from '../services/purchase.service';
import type { PurchaseEntryPoint } from '../subscription.types';

/**
 * 이메일 인증을 거쳐 결제로 돌아올 요청(auth.md 4.4 · paywall.md 4.5-3) — 인증을 마치면 같은 요금제로
 * 결제 흐름을 이어 간다. 서버가 모르는 클라이언트 고유 상태라 store 에 둔다(convention.md 4.2).
 */
export interface EmailResumeRequest {
  planId: string;
  entryPoint: PurchaseEntryPoint;
  /** 요청 시각(ms) — 유효 시간 판정용. 정책 판정이 아니라 화면 복귀 범위다 */
  requestedAt: number;
  /** 인증 성공 통지를 받았는가 — 받은 뒤에만 이어 간다 */
  isVerified: boolean;
}

interface SubscriptionPurchaseStore {
  /** 결제 서비스가 쓴다 — 화면은 읽기만 한다 */
  phase: PurchasePhase;
  isVerificationDelayed: boolean;
  emailResume: EmailResumeRequest | null;
  setEmailResume: (request: EmailResumeRequest | null) => void;
  markEmailVerified: () => void;
}

export const useSubscriptionPurchaseStore = create<SubscriptionPurchaseStore>((set) => ({
  phase: 'idle',
  isVerificationDelayed: false,
  emailResume: null,
  setEmailResume: (request) => set({ emailResume: request }),
  markEmailVerified: () =>
    set((state) =>
      state.emailResume === null
        ? state
        : { emailResume: { ...state.emailResume, isVerified: true } },
    ),
}));

/** 결제·복원 진행 중인가 — 페이월 시트가 닫기를 막는 데 쓴다(paywall.md 5장) */
export const useIsPurchaseInProgress = (): boolean =>
  useSubscriptionPurchaseStore((s) => s.phase !== 'idle');

/**
 * 이메일 인증 성공 통지 — 결제로 돌아갈 요청이 있으면 이어 가게 표시한다.
 * 페이월에서 떠난 요청이면 true — 호출자(app)가 내려 둔 시트를 다시 연다.
 */
export const markEmailVerifiedForPurchase = (): boolean => {
  const { emailResume, markEmailVerified } = useSubscriptionPurchaseStore.getState();
  if (emailResume === null) return false;
  markEmailVerified();
  return emailResume.entryPoint === 'paywall';
};
