/**
 * 레이트 리밋 수치 — `architecture.md` 9.6의 초기값
 * (`changes/pending/rate-limit-numbers.md`, 2026-09-09 코드 선반영).
 *
 * 전부 **분당** 한도이며 인메모리 저장(단일 인스턴스). 스케일아웃 시 Redis 스토리지로 바꾼다.
 * 수치 조정은 이 상수 + 9.6 표 갱신으로 한다.
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** 일반 API 전역 기본 — 인증 사용자 id, 비인증은 IP. 플레이어 위치 저장(5초)에 목록 조회를 더해도 수십 회 */
export const RATE_LIMIT_DEFAULT_PER_MINUTE = 300;

/** 소셜 로그인·가입·토큰 갱신 — IP. 정상 앱은 실행당 1~2회. 제공자 호출 비용·크리덴셜 스터핑 방어 */
export const RATE_LIMIT_AUTH_PER_MINUTE = 20;

/** 이메일 인증 발송 — 사용자. 앱 레벨 상한(주소당 5회·계정당 시간당 20회)의 앞단 방어 */
export const RATE_LIMIT_EMAIL_SEND_PER_MINUTE = 5;

/** 서명 URL 발급 — 사용자. 정상 재생은 5분마다 1회. 대량 다운로드 패턴의 1차 방어(9.4) */
export const RATE_LIMIT_AUDIO_URL_PER_MINUTE = 30;
