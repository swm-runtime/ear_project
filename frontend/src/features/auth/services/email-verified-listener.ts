import type { EmailVerifiedResult } from '../auth.types';

/**
 * 인증 성공 통지 — 프로필·설정 요약의 invalidate는 app/bootstrap이 이 리스너에 주입한다.
 * auth가 두 feature의 쿼리 키를 직접 import하면 의존 방향(architecture.md 4.4 —
 * profile·settings → auth)의 역행이라 순환이 된다. career의 saved-listener와 같은 방식.
 */
type EmailVerifiedListener = (result: EmailVerifiedResult) => void;

const listeners = new Set<EmailVerifiedListener>();

export const registerEmailVerifiedListener = (listener: EmailVerifiedListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 검증 성공(auth-api.md 4.10)에만 호출한다 — 발송·이탈은 계정 값을 바꾸지 않는다 */
export const notifyEmailVerified = (result: EmailVerifiedResult): void => {
  listeners.forEach((listener) => listener(result));
};
