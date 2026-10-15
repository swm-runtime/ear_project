/**
 * 대본 분량 환산 (spec/04 · 글로벌 명세 6.4). 한국판은 공백·기호 뺀 글자 수 ÷ 341(eleven_v4 실측, 2026-10-08)이고 각 단계가 그 식을 그대로 쓴다.
 * 글로벌판은 단어 수 ÷ 150 — 대화체 영어 일반 범위의 잠정값이다. 파일럿 합성 3편 이상 실측 후 확정한다(KAN-203).
 */
export const WORDS_PER_MIN_EN = 150;
/** 분량 하한 13분의 단어 수 (글로벌 명세 6.5 L0) */
export const MIN_WORDS_EN = 13 * WORDS_PER_MIN_EN;

/** 영어 단어 수 — 영숫자 덩어리. 아포스트로피·하이픈으로 이어진 것은 한 단어(don't · K-pop). "2,000" 은 둘로 센다 */
export function countWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
}
