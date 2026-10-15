import { APP_LANGUAGE, type AppLanguage } from '@/shared/i18n/locale';

/**
 * 약관·개인정보처리방침 목적지 — 설정 [이용약관]·[개인정보처리방침]과 구독 화면·페이월의 필수 표기 링크가
 * 같은 주소를 쓴다(subscription.md 5장 "약관·개인정보처리방침 링크"). 원천은 배포 설정이고
 * **폴백을 실값으로 둔다** — env 누락이 죽은 링크로 나가지 않게(settings.constants.ts 와 같은 이유).
 *
 * **표시 언어별 경로**(KAN-197 — 글로벌 4). 한국어는 종전 그대로 `EXPO_PUBLIC_TERMS_URL` ·
 * `EXPO_PUBLIC_PRIVACY_POLICY_URL`(없으면 `/terms` · `/privacy`), 영어는 랜딩의 영어 본문 `/en/terms` · `/en/privacy` 다.
 * 영어에도 env 를 따로 둔다(`EXPO_PUBLIC_TERMS_URL_EN` · `EXPO_PUBLIC_PRIVACY_POLICY_URL_EN`) — 한국어 env 를 영어에
 * 그대로 쓰면 한국어 본문이 열리고, 한국어 env 에 `/en` 을 붙이면 env 가 가리키는 곳(쿼리·다른 호스트)에 따라 깨진
 * 주소가 된다. 그래서 두 언어의 원천을 따로 두고 각자 실값 폴백을 갖는다.
 *
 * 언어는 **표시 언어**(`APP_LANGUAGE` — 설정에서 고른 언어, 없으면 기기 언어)다. 사용자가 읽을 수 있는 본문을 연다.
 * 계정 삭제 안내(`/account-deletion` · `/en/account-deletion`)는 스토어 등록 정보에만 걸려 있고 앱에는 링크가 없다.
 * 제3자 저작물 고지(`LICENSES_URL`, settings.constants.ts)는 영어 페이지가 없어 한국어 그대로다.
 */
export interface LegalUrls {
  terms: string;
  privacy: string;
}

const LANDING_ORIGIN = 'https://earcast.co.kr';

const KO_LEGAL_URLS: LegalUrls = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL ?? `${LANDING_ORIGIN}/terms`,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? `${LANDING_ORIGIN}/privacy`,
};

const EN_LEGAL_URLS: LegalUrls = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL_EN ?? `${LANDING_ORIGIN}/en/terms`,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL_EN ?? `${LANDING_ORIGIN}/en/privacy`,
};

/** 표시 언어의 약관·개인정보처리방침 주소 */
export const legalUrlsFor = (language: AppLanguage): LegalUrls =>
  language === 'en' ? EN_LEGAL_URLS : KO_LEGAL_URLS;

export const TERMS_URL = legalUrlsFor(APP_LANGUAGE).terms;
export const PRIVACY_POLICY_URL = legalUrlsFor(APP_LANGUAGE).privacy;
