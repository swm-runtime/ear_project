/**
 * subscription feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 구독 결제(KAN-120)·요금제 관리 화면·페이월의 요금제 비교를 소유한다(architecture.md 4.1 · 5.6).
 * **구독 UI 가 꺼진 바이너리(플래그·결제 모듈·플랫폼 — shared/lib/feature-flags.ts)에서는 화면도 결제 모듈 호출도 없다.**
 */
export { default as SubscriptionScreen } from './screens/SubscriptionScreen';
/** 한도 안내 시트(player)가 페이월 자리에서 얹는 요금제 비교·결제 버튼 — player 는 결제 결과만 받는다(architecture.md 5.2) */
export { default as PaywallPlansSection } from './components/PaywallPlansSection';
export type { PaywallPlansSectionProps } from './components/PaywallPlansSection';
export {
  markEmailVerifiedForPurchase,
  useIsPurchaseInProgress,
} from './store/subscription-purchase.store';

/* ── app/bootstrap 배선 — 로그인 전이·포그라운드·다른 feature 캐시 무효화(architecture.md 5.5) ── */
export {
  registerSubscriptionChangedListener,
  resumeSubscriptionSync,
  startSubscriptionSync,
  stopSubscriptionSync,
} from './services/subscription-sync';
export { registerEmailVerificationOpener } from './services/email-verification-opener';
export { subscriptionKeys } from './api/subscription.api';
export type { Entitlements, MySubscription } from './subscription.types';
