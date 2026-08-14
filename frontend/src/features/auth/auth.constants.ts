import type { SocialProvider } from './auth.types';

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
