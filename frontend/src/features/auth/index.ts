/**
 * auth feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 auth에 접근한다.
 */
export { default as StartScreen } from './screens/StartScreen';
export { default as TermsConsentScreen } from './screens/TermsConsentScreen';
export { sessionService } from './services/session.service';
export { useSessionStore } from './store/session.store';
export type { AuthStackParamList, AuthUser, SocialProvider } from './auth.types';
