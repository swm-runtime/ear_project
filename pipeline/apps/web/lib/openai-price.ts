/**
 * OpenAI 단가 (USD / 100만 토큰: [입력, 캐시 입력, 출력]) — 콘솔이 직접 부르는 호출(배제 주제 판정)의 비용 환산용 (2026-10-15).
 * 워커 단가표 apps/worker/src/executors/openai-api.ts PRICE 와 같은 값이다 — 콘솔은 @ear/pipeline·워커 코드를 가져오지 않아(lib/locale.ts 와 같은 사정) 필요한 모델만 옮겼다. 값을 바꾸면 양쪽을 같이
 */
const PRICE: Record<string, [number, number, number]> = { "gpt-6.1-sol": [2, 0.1, 10], "gpt-6-sol": [2, 0.2, 10], "gpt-6-luna": [0.1, 0.01, 0.5], "gpt-6-astra": [10, 1, 50] };

/** 모르는 모델은 null — 0 으로 적으면 "공짜 호출"로 읽힌다 */
export function openAiCostUsd(model: string, inTok: number, cachedTok: number, outTok: number): number | null {
  const price = PRICE[model] ?? PRICE[Object.keys(PRICE).find((k) => model.startsWith(k)) ?? ""];
  if (!price) return null;
  return Math.round((((inTok - cachedTok) * price[0] + cachedTok * price[1] + outTok * price[2]) / 1e6) * 1e6) / 1e6;
}
