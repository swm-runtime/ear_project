/**
 * auth feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 auth에 접근한다.
 */
export { default as ProviderIcon } from './components/ProviderIcon';
export { default as StartScreen } from './screens/StartScreen';
export { default as TermsConsentScreen } from './screens/TermsConsentScreen';
export { default as EmailVerificationScreen } from './screens/EmailVerificationScreen';
export { sessionService } from './services/session.service';
export { useSessionStore } from './store/session.store';
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
  EmailVerifiedResult,
  SocialProvider,
} from './auth.types';
