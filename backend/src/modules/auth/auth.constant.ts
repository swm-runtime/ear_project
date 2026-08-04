/** architecture.md 9.1 — 토큰 수명(잠정) */
export const ACCESS_TOKEN_TTL_SEC = 30 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

/** auth-api.md 9 미결 사항 — 약관 동의 화면 체류 시간을 감안해 10분으로 확정 */
export const SIGNUP_TOKEN_TTL_SEC = 10 * 60;

/** architecture.md 7.7 — 외부(제공자) 호출은 짧게 끊는다 */
export const PROVIDER_REQUEST_TIMEOUT_MS = 5000;

/** 제공자가 닉네임을 주지 않는 경우의 기본값 — `users.nickname`은 NOT NULL이다 */
export const DEFAULT_NICKNAME = '이어 사용자';

export const ACCESS_TOKEN_TYPE = 'access';
export const SIGNUP_TOKEN_TYPE = 'signup';
