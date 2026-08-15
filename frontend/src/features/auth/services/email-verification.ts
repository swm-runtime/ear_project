/**
 * 이메일 인증 화면의 순수 판정 로직(convention.md 7.2 대상).
 * 시각 계산은 전부 서버가 준 시각 문자열을 기준으로 한다 — 만료·쿨다운의 최종 판정은
 * 서버 몫이고 여기서 만드는 값은 표시용이다(auth-uiux.md 4.10).
 */

/**
 * 형식 검증(auth-uiux.md 4.8) — 통과 못 하면 발송 요청 자체를 보내지 않는다.
 * 최종 검증은 서버(EMAIL_FORMAT_INVALID)가 하므로 여기서는 명백한 오입력만 거른다.
 */
export const isEmailFormatValid = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** 서버 시각까지 남은 초 — 지났으면 0. 표시용 카운트다운의 재료다 */
export const remainingSeconds = (targetIso: string, nowMs: number): number => {
  const remaining = Math.ceil((Date.parse(targetIso) - nowMs) / 1000);
  return remaining > 0 ? remaining : 0;
};

/** 카운트다운 `mm:ss` 표기(auth-uiux.md 4.10 — `02:41` 형태) */
export const formatCountdown = (totalSeconds: number): string => {
  const clamped = totalSeconds > 0 ? totalSeconds : 0;
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * 발송 잠금 안내의 분 단위 환산(auth-uiux.md 4.14) — 서버의 `retry_after_sec`을
 * 올림한다. 내림하면 "0분 후"가 되어 즉시 재시도로 읽힌다.
 */
export const lockRemainingMinutes = (retryAfterSec: number): number =>
  Math.max(1, Math.ceil(retryAfterSec / 60));
