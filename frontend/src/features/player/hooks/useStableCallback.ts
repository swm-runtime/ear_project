import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * **늘 같은 함수**를 돌려주되, 부르면 마지막 렌더의 `fn` 을 실행한다 — memo 된 자식(재생 목록 패널·줄)에 넘기는 콜백용(KAN-260).
 * 화면은 재생 위치가 0.5초마다 바뀌어 다시 그려지는데, 인라인 콜백을 넘기면 그때마다 자식이 다시 그려졌다.
 * 렌더 중에 부르지 않는다(이벤트·제스처·effect 에서만) — 렌더 중엔 아직 이전 렌더의 `fn` 이다.
 */
export const useStableCallback = <Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
): ((...args: Args) => Result) => {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
};
