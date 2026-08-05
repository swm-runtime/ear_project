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
