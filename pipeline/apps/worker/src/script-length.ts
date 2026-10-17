/**
 * 대본 분량 환산 (spec/04 · 글로벌 명세 6.4). 한국판은 공백·기호 뺀 글자 수 ÷ 341(eleven_v4 실측, 2026-10-08)이고 각 단계가 그 식을 그대로 쓴다.
 * 글로벌판은 단어 수 ÷ 146 — 잠정값 150 으로 시작해 파일럿 합성 3편 실측(145.3·148.3·146.3, eleven_v4)으로 확정했다(2026-10-17, KAN-203).
 */
export const WORDS_PER_MIN_EN = 146;
/** 분량 하한 (글로벌 명세 1.3·6.5 L0) — 2026-10-17 박수헌: 출퇴근길 같은 청취 상황을 가정하지 않으므로 13분 → 5분. 평균 목표 없음 */
export const MIN_MINUTES_EN = 5;
/** 분량 하한의 단어 수 */
export const MIN_WORDS_EN = MIN_MINUTES_EN * WORDS_PER_MIN_EN;

/** 영어 단어 수 — 영숫자 덩어리. 아포스트로피·하이픈으로 이어진 것은 한 단어(don't · K-pop). "2,000" 은 둘로 센다 */
export function countWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
}
