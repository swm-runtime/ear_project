/**
 * 저장 성공 통지 — 프로필 요약 invalidate는 profile의 키 팩토리로 해야 하는데
 * (profile/index.ts의 갱신 계약: 저장 성공에만 호출), career가 profile을 직접 import하면
 * 의존 방향이 역행한다(profile → career가 자연 방향 — dev mock 요약이 이 feature를 읽는다).
 * interest-saved-listener와 같은 방식으로 app/bootstrap이 구현을 주입한다(architecture.md 4.3).
 */
type CareerSavedListener = () => void;

const listeners = new Set<CareerSavedListener>();

export const registerCareerSavedListener = (listener: CareerSavedListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 커리어 저장(PUT /users/me/career) 성공 직후 1회 호출된다 */
export const notifyCareerSaved = (): void => {
  listeners.forEach((listener) => listener());
};
