/**
 * 저장 성공 통지 — 프로필·설정 요약 invalidate는 각 feature의 키 팩토리로 해야 하는데
 * (각 index.ts의 갱신 계약), interest가 두 feature를 직접 import하면 의존 표의
 * profile·settings → interest와 순환이 된다. player ↔ library 브리지와 같은 방식으로
 * app/bootstrap이 구현을 주입한다(architecture.md 4.3 — 콜백 주입으로 방향 뒤집기).
 */
type InterestSavedListener = () => void;

const listeners = new Set<InterestSavedListener>();

export const registerInterestSavedListener = (listener: InterestSavedListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 일괄 저장(PUT /users/me/interests) 성공 직후 1회 호출된다 */
export const notifyInterestSaved = (): void => {
  listeners.forEach((listener) => listener());
};
