import type { SocialProvider } from '../auth.types';

/** 사용자가 제공자 인증 창에서 취소한 경우 — 실패가 아니므로 에러 UI를 띄우지 않는다(auth-uiux.md 4.2) */
export class ProviderAuthCancelledError extends Error {
  constructor() {
    super('provider auth cancelled by user');
    this.name = 'ProviderAuthCancelledError';
  }
}

/**
 * 소셜 로그인 SDK 스텁 — SDK 선정이 미결이다(frontend/architecture.md 미결 사항).
 * TODO(auth): 카카오·네이버·구글 SDK 연동 시 교체한다.
 *  - 사용자 취소는 ProviderAuthCancelledError로 던진다.
 *  - 제공자 앱 미설치 시 웹 로그인 폴백(auth.md 7).
 * 개발 빌드에서는 서버 연동 테스트를 위해 가짜 토큰을 반환한다.
 */
export const authenticateWithProvider = async (provider: SocialProvider): Promise<string> => {
  if (__DEV__) {
    return `dev-provider-token-${provider}`;
  }
  throw new Error('social login SDK not integrated yet');
};
