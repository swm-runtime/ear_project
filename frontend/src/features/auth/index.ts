/**
 * auth feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 auth에 접근한다.
 */
export { default as ProviderIcon } from './components/ProviderIcon';
export { default as ReconsentScreen } from './screens/ReconsentScreen';
export { default as SplashScreen } from './screens/SplashScreen';
/** 스플래시 로고 모션 완료 — 관문(RootNavigator)이 최소 노출 판정에 읽는다(splash.md 4-6) */
export { useSplashStore } from './store/splash.store';
export { default as StartScreen } from './screens/StartScreen';
export { default as ContentLanguageScreen } from './screens/ContentLanguageScreen';
export { default as TermsConsentScreen } from './screens/TermsConsentScreen';
export { default as EmailVerificationScreen } from './screens/EmailVerificationScreen';
export { default as WithdrawalScreen } from './screens/WithdrawalScreen';
/** 설정 › 콘텐츠 언어(시장) 전환(KAN-228) — MainStack(설정)·OnboardingStack(재온보딩 [되돌리기]) 두 곳에 등록한다 */
export { default as MarketChangeScreen } from './screens/MarketChangeScreen';
/** 시장 전환 뒤 재온보딩 표시(KAN-228) — 온보딩이 읽는다: [되돌리기] 대상 · 완료 GA 거르기 · 완료 때 지우기 */
export {
  clearReonboardingAfterMarketChange,
  getMarketChangeRevertTarget,
  isReonboardingAfterMarketChange,
} from './services/market-change-state';
/** 시장 전환 통지 — 캐시 비우기·온보딩 상태 초기화는 app/bootstrap 이 주입한다 */
export { registerMarketChangedListener } from './services/market-changed-listener';
export { sessionService } from './services/session.service';
export { useSessionStore } from './store/session.store';
/**
 * 세션 사용자의 시장(global-api.md 2.1) — `useSessionStore(selectMarket)`. 서버 판정값이며 기기 언어로 추측하지 않는다.
 * 미로그인·구 서버 응답은 `kr`
 */
export { selectMarket } from './store/session.store';
/**
 * 인증 성공 통지 — 프로필·설정 요약 invalidate는 app/bootstrap이 주입한다
 * (검증 성공에만 호출된다. 발송·이탈은 계정 값을 바꾸지 않는다 — auth-api.md 4.10)
 */
export { registerEmailVerifiedListener } from './services/email-verified-listener';
/** dev mock 전용 — 계정 이메일 상태의 원본. 프로필·설정 mock이 읽는다(career mock과 같은 패턴) */
export { getEmailMockAccount } from './api/email-verification.mock';
export type {
  ActiveEmailVerification,
  AuthStackParamList,
  AuthUser,
  ContentLanguage,
  EmailVerifiedResult,
  Market,
  MarketChangeParams,
  SocialProvider,
} from './auth.types';
