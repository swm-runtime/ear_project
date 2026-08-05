import { useEffect, useState } from 'react';

/** common-error-handling.md 5 — 0.3초 미만 로딩은 표시하지 않는다 */
export const LOADING_INDICATOR_DELAY_MS = 300;

/**
 * 로딩 인디케이터의 지연 노출 훅. isActive가 delayMs 이상 유지될 때만 true를 반환한다 —
 * 빠른 응답에서 스켈레톤이 한 프레임 깜빡이는 것을 막는다(architecture.md 8.3).
 */
export const useDelayedVisible = (
  isActive: boolean,
  delayMs: number = LOADING_INDICATOR_DELAY_MS,
): boolean => {
  const [isVisible, setIsVisible] = useState(false);

  // 비활성 전환 시 파생 상태를 렌더 중에 되돌린다 — effect의 동기 setState를 피한다(react.dev "You might not need an effect")
  if (!isActive && isVisible) {
    setIsVisible(false);
  }

  // 지연 타이머와 동기화한다 — setState는 타이머 콜백에서만 일어난다
  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => setIsVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [isActive, delayMs]);

  return isVisible;
};
