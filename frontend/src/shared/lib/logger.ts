/**
 * convention.md 9장 — console 직접 사용 금지, 이 로거만 경유한다.
 * debug는 개발 빌드에서만 출력된다. 토큰·서명 URL·영수증·개인식별정보를 남기지 않는다.
 * 에러 수집 도구 연동은 미결(architecture.md 8.4) — 선정 시 error 레벨에 연결한다.
 */
 
export const logger = {
  debug: (...args: unknown[]) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
