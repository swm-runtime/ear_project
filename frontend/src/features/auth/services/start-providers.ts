import type { AppLanguage } from '@/shared/i18n/locale';

import { SOCIAL_PROVIDERS } from '../auth.constants';
import type { SocialProvider } from '../auth.types';

/** 국내 전용 제공자 — 해외 사용자에게는 계정이 없어 고를 수 없는 버튼이다 */
const KOREA_ONLY_PROVIDERS: readonly SocialProvider[] = ['naver', 'kakao'];

/**
 * A1 시작 화면의 제공자 버튼 목록(auth-uiux.md 4.1).
 *
 * **로그인 전에는 시장(`users.market`)을 모른다** — 시장은 가입 때 서버가 정한다. 그래서 이 화면만은
 * **표시 언어**로 거른다(2026-10-15 PM 결정): 영어 표시면 Google·Apple 둘, 한국어 표시면 네 개 전부.
 * 순서는 `SOCIAL_PROVIDERS`가 소유한다. 영어 기기의 한국 사용자는 Google·Apple로 가입하고 A21에서
 * 한국어를 고르면 KR 시장이 된다 — 카카오·네이버 기존 계정은 기기 언어를 한국어로 두어야 보인다.
 */
export const providersFor = (language: AppLanguage): readonly SocialProvider[] =>
  language === 'ko'
    ? SOCIAL_PROVIDERS
    : SOCIAL_PROVIDERS.filter((provider) => !KOREA_ONLY_PROVIDERS.includes(provider));
