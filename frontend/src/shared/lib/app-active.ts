import { AppState } from 'react-native';

/**
 * 앱이 전경(`active`)이 되면 `callback` 을 **한 번** 부른다. 이미 전경이면 곧바로 부른다.
 *
 * 전경이면 기기 잠금이 풀려 있다 — 키체인이 잠금 때문에 막힌 작업을 다시 시도할 시점으로 쓴다
 * (architecture.md 7.2). 반환값을 부르면 아직 부르지 않은 구독을 취소한다.
 */
export const runWhenAppActive = (callback: () => void): (() => void) => {
  if (AppState.currentState === 'active') {
    callback();
    return () => undefined;
  }
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    subscription.remove();
    callback();
  });
  return () => subscription.remove();
};
