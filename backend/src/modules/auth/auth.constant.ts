/** architecture.md 9.1 — 토큰 수명(잠정) */
export const ACCESS_TOKEN_TTL_SEC = 30 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

/** auth-api.md 9 미결 사항 — 약관 동의 화면 체류 시간을 감안해 10분으로 확정 */
export const SIGNUP_TOKEN_TTL_SEC = 10 * 60;

/** architecture.md 7.7 — 외부(제공자) 호출은 짧게 끊는다 */
export const PROVIDER_REQUEST_TIMEOUT_MS = 5000;

export const ACCESS_TOKEN_TYPE = 'access';

/** 파이프라인 웹 SSO 어서션의 typ (changes/pending/pipeline-sso-login.md) */
export const PIPELINE_ASSERTION_TYPE = 'pipeline_sso';
export const SIGNUP_TOKEN_TYPE = 'signup';

/** 개발용 대역 계정의 provider_user_id 길이 — `users.provider_user_id`(varchar 255) 안에 고정한다 */
export const DEV_PROVIDER_USER_ID_LENGTH = 32;

/**
 * 애플 identity token 검증 (`auth-api.md` 4.1).
 *
 * 다른 제공자와 달리 **제공자 API를 부르지 않고** 토큰 자체를 검증한다 — 서명을 애플
 * 공개키로 확인하고 `iss` · `aud` · `exp`와 nonce를 대조한다.
 */
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * 공개키 캐시 수명. 애플은 키를 주기적으로 교체하므로 영구 캐시하면 교체 직후 전원이
 * 로그인하지 못한다. 반대로 매 요청마다 받아오면 로그인 지연이 애플 응답에 묶인다.
 * 캐시에 없는 `kid`가 오면 TTL과 무관하게 한 번 더 받아온다(교체 즉시 대응).
 */
export const APPLE_JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * 구글 ID 토큰 검증 (`auth-api.md` 4.1).
 *
 * **액세스 토큰이 아니라 ID 토큰(JWT)을 받는다.** `@react-native-google-signin/google-signin`이
 * `webClientId` 설정 시 ID 토큰을 반환하며, 그 편이 제공자 API 왕복 없이 서명과 `aud`만으로
 * 검증이 끝난다(애플과 같은 경로). 구글은 `iss`를 두 형태로 발급해와 둘 다 허용한다.
 */
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS: [string, ...string[]] = [
  'https://accounts.google.com',
  'accounts.google.com',
];
export const GOOGLE_JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * 카카오 토큰 정보 조회 (`auth-api.md` 4.1).
 *
 * **액세스 토큰에는 대상 앱 정보가 실려 있지 않다.** 프로필만 받아오면 다른 카카오 앱에서
 * 발급된 토큰으로도 우리 계정에 로그인할 수 있으므로, `app_id`를 대조한다 — 구글·애플의
 * `aud` 검증에 해당하는 자리다.
 */
export const KAKAO_TOKEN_INFO_URL =
  'https://kapi.kakao.com/v1/user/access_token_info';
