/** architecture.md 9.1 — 토큰 수명(잠정) */
export const ACCESS_TOKEN_TTL_SEC = 30 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

/** auth-api.md 9 미결 사항 — 약관 동의 화면 체류 시간을 감안해 10분으로 확정 */
export const SIGNUP_TOKEN_TTL_SEC = 10 * 60;

/** architecture.md 7.7 — 외부(제공자) 호출은 짧게 끊는다 */
export const PROVIDER_REQUEST_TIMEOUT_MS = 5000;

export const ACCESS_TOKEN_TYPE = 'access';
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
