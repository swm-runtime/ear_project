import type { SocialProvider } from './auth.types';

/**
 * 이메일 인증 API의 mock 전환(CLAUDE.local 개발 방식 — onboarding·career와 동일 패턴).
 * `EXPO_PUBLIC_EMAIL_VERIFICATION_API=real`로 실서버 전환. 소셜 로그인은 SDK 스텁이
 * 따로 담당하므로 이 플래그의 범위는 이메일 인증 엔드포인트(auth-api.md 4.8~4.11)뿐이다.
 */
export const IS_EMAIL_VERIFICATION_API_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_EMAIL_VERIFICATION_API !== 'real';

/**
 * 인증 API(social-login·sign-up·refresh·logout)의 mock 전환 — 백엔드 없이 A1(시작)
 * →A3(약관)→가입→온보딩 진입까지 로그인 흐름을 테스트한다. `EXPO_PUBLIC_AUTH_API=real`로
 * 실서버 전환. 시나리오는 `api/auth.mock.ts` 머리 주석 참고.
 */
export const IS_AUTH_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_AUTH_API !== 'real';

/**
 * 제공자 SDK 인증의 mock 전환 — 실제 소셜 계정 로그인 없이 가짜 provider_token으로
 * 로그인 동작을 넘어간다. 층이 API mock과 다르다: 이쪽은 제공자(구글·카카오…) 대역,
 * API mock은 우리 서버 대역이다.
 *
 * **Expo Go에서는 항상 mock으로 둔다** — 네이티브 SDK 모듈이 Expo Go에 없어
 * `EXPO_PUBLIC_PROVIDER_AUTH=real`은 dev client(프리빌드) 빌드에서만 의미가 있다.
 */
export const IS_PROVIDER_AUTH_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_PROVIDER_AUTH !== 'real';

/** 인증 코드 자릿수(auth.md 4.5 — 6자리 숫자) */
export const EMAIL_CODE_LENGTH = 6;

/** 시작 화면의 제공자 버튼 노출 순서 */
export const SOCIAL_PROVIDERS: readonly SocialProvider[] = ['naver', 'kakao', 'google', 'apple'];

/**
 * 각 제공자 브랜드 가이드 색상 — 임의 변경 시 심사 반려 사유가 된다(auth-uiux.md 4.1).
 * 테마 토큰이 아니라 브랜드 고정값이므로 여기서만 관리한다.
 * 심볼(로고) 경로는 `components/ProviderIcon.tsx`가 소유한다.
 */
export const PROVIDER_BRAND: Record<
  SocialProvider,
  { background: string; text: string; border?: string }
> = {
  kakao: { background: '#FEE500', text: '#191919' },
  naver: { background: '#03C75A', text: '#FFFFFF' },
  google: { background: '#FFFFFF', text: '#1F1F1F', border: '#747775' },
  /** 밝은 배경 위에서는 검정 바탕 + 흰 로고가 애플 가이드 기본형이다 */
  apple: { background: '#000000', text: '#FFFFFF' },
};
