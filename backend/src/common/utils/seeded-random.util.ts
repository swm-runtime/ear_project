import { sha256Hex } from './hash.util';

/**
 * 같은 시드로는 항상 같은 순서를 만드는 셔플.
 *
 * 온보딩 3단계의 랜덤 폴백은 **사용자·온보딩 세션 단위로 고정돼야 한다**
 * (onboarding.md 4 [3]) — 뒤로가기로 돌아왔을 때 카드가 통째로 바뀌면 방금 보던 콘텐츠를
 * 다시 찾을 수 없고, 담기를 망설인 사용자가 그대로 이탈한다.
 *
 * 스냅샷을 저장할 자리가 아직 없어 결정적 시드로 고정한다. **후보 풀이 바뀌면 결과가
 * 흔들린다는 한계가 있다**(onboarding-api.md 9장 미결 사항).
 */

/** 문자열 시드를 32비트 정수로 환산한다 */
export function toNumericSeed(value: string): number {
  return Number.parseInt(sha256Hex(value).slice(0, 8), 16);
}

/** mulberry32 — 시드 하나로 재현 가능한 난수열을 만든다 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 입력 배열을 바꾸지 않고 셔플한 새 배열을 돌려준다 (Fisher-Yates) */
export function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  const random = createRandom(toNumericSeed(seed));
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled;
}
