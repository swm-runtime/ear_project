/**
 * 약관·개인정보처리방침 목적지 — 설정 [이용약관]·[개인정보처리방침], 구독 화면·페이월의 필수 표기 링크, 가입·재동의 화면의
 * [보기]가 같은 주소를 쓴다(subscription.md 5장 "약관·개인정보처리방침 링크"). 원천은 배포 설정이고
 * **폴백을 실값으로 둔다** — env 누락이 죽은 링크로 나가지 않게(settings.constants.ts 와 같은 이유).
 *
 * **시장별 경로**(KAN-216 — KAN-197 의 표시 언어 기준을 바꿨다). KR 은 종전 그대로 `EXPO_PUBLIC_TERMS_URL` ·
 * `EXPO_PUBLIC_PRIVACY_POLICY_URL`(없으면 `/terms` · `/privacy`), GLOBAL 은 랜딩의 영어 본문 `/en/terms` · `/en/privacy` 다.
 * GLOBAL 에도 env 를 따로 둔다(`EXPO_PUBLIC_TERMS_URL_EN` · `EXPO_PUBLIC_PRIVACY_POLICY_URL_EN`) — KR env 를 그대로 쓰면
 * 한국어 본문이 열리고, KR env 에 `/en` 을 붙이면 env 가 가리키는 곳(쿼리·다른 호스트)에 따라 깨진 주소가 된다.
 *
 * 기준이 **표시 언어가 아니라 시장**인 이유: 어떤 약관·처리방침이 적용되느냐는 계정이 속한 시장의 문서다. 앱을 영어로 둔
 * KR 계정에 영어 처리방침(GLOBAL 문서 — 국외 이전 동의 근거 등이 다르다)을 보여 주면 동의한 문서와 다른 문서를 보게 된다.
 * 시장은 호출부가 넘긴다 — 가입 전(A4)은 A21에서 고른 콘텐츠 언어가 가리키는 시장, 가입 후는 세션 `user.market` 이다.
 *
 * 계정 삭제 안내(`/account-deletion` · `/en/account-deletion`)는 스토어 등록 정보에만 걸려 있고 앱에는 링크가 없다.
 * 제3자 저작물 고지(`LICENSES_URL`, settings.constants.ts)는 영어 페이지가 없어 한국어 그대로다.
 */
export interface LegalUrls {
  terms: string;
  privacy: string;
  /** 처리방침의 국외 이전 절 — 국외 이전 동의(`cross_border_transfer`) 항목의 [보기] */
  crossBorderTransfer: string;
}

/**
 * 법적 문서를 고르는 시장(`users.market` 값과 같다 — global-api.md 2.1). shared 는 feature 타입을 들여오지 않으므로
 * 같은 값을 여기서 따로 선언한다(auth 의 `Market` 과 구조가 같아 그대로 넘길 수 있다).
 */
export type LegalMarket = 'kr' | 'global';

const LANDING_ORIGIN = 'https://earcast.co.kr';

/**
 * 처리방침 국외 이전 절의 앵커. 랜딩 `components/Prose.tsx` 의 h2 id 는 **순번**(`s1`, `s2`…)이다 —
 * 한국어 `content/legal.ts` "6. 국외 이전", 영어 `content/legal-en.ts` "6. International transfers" 가 둘 다 여섯 번째 h2 라
 * `s6` 이다(2026-10-16 확인). 랜딩에서 앞쪽에 h2 를 끼우면 앵커가 밀린다 — 그때 이 값을 함께 고친다.
 */
const CROSS_BORDER_ANCHOR: Readonly<Record<LegalMarket, string>> = {
  kr: 's6',
  global: 's6',
};

/** 앵커를 붙인다. env 주소에 이미 `#` 이 있으면 덮어 쓴다 — 조각이 두 개면 브라우저가 첫 것만 읽는다 */
const withAnchor = (url: string, anchor: string): string => `${url.split('#')[0]}#${anchor}`;

const buildLegalUrls = (market: LegalMarket, terms: string, privacy: string): LegalUrls => ({
  terms,
  privacy,
  crossBorderTransfer: withAnchor(privacy, CROSS_BORDER_ANCHOR[market]),
});

const KR_LEGAL_URLS = buildLegalUrls(
  'kr',
  process.env.EXPO_PUBLIC_TERMS_URL ?? `${LANDING_ORIGIN}/terms`,
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? `${LANDING_ORIGIN}/privacy`,
);

const GLOBAL_LEGAL_URLS = buildLegalUrls(
  'global',
  process.env.EXPO_PUBLIC_TERMS_URL_EN ?? `${LANDING_ORIGIN}/en/terms`,
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL_EN ?? `${LANDING_ORIGIN}/en/privacy`,
);

/** 시장의 약관·개인정보처리방침 주소 */
export const legalUrlsFor = (market: LegalMarket): LegalUrls =>
  market === 'global' ? GLOBAL_LEGAL_URLS : KR_LEGAL_URLS;
