import type { Market } from '../auth.types';

/**
 * 시장 전환 통지(KAN-228) — 캐시 비우기·온보딩 상태 초기화는 app/bootstrap 이 이 리스너에 주입한다. auth 가 온보딩·
 * 다른 feature 의 store·쿼리 키를 import 하면 의존 방향(architecture.md 4.4 — onboarding·settings → auth)의 역행이다.
 * 이메일 인증 리스너와 같은 방식
 */
type MarketChangedListener = (market: Market) => void;

const listeners = new Set<MarketChangedListener>();

export const registerMarketChangedListener = (listener: MarketChangedListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 토큰·세션을 새 시장으로 바꾼 직후 한 번 */
export const notifyMarketChanged = (market: Market): void => {
  listeners.forEach((listener) => listener(market));
};
