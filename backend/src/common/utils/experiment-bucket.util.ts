/**
 * 실험 그룹 배정(2026-10-29 — 단기 실험 공용, KAN-289 첫 사용). **같은 사용자는 같은 실험에서 늘 같은 그룹**이고,
 * 실험 키가 다르면 그룹이 서로 독립이다(한 실험의 A가 다른 실험의 A로 몰리지 않는다). 무작위가 아니라 해시라
 * 저장 없이 어디서 다시 계산해도 같다 — 배정 표를 두지 않는다.
 *
 * 해시는 리텐션 알림 문구 변형(`assignVariant`)과 같은 FNV-1a 32bit에 **마무리 섞기(murmur3 fmix32)를 더한다.**
 * FNV-1a만으로 `% 2`를 하면 결과가 입력 글자 코드의 홀짝 합과 같아진다(곱하는 소수가 홀수라 최하위 비트가 섞이지
 * 않는다) — 실험 키만 다른 두 실험의 A/B가 사용자마다 똑같거나 정확히 뒤집혀 독립이 깨진다. 섞기를 거치면 모든 비트가
 * 입력 전체에 의존한다.
 */
export function experimentBucket(
  userId: string,
  experimentKey: string,
  buckets: number,
): number {
  if (!Number.isInteger(buckets) || buckets <= 1) {
    return 0;
  }

  return fmix32(fnv1a32(`${experimentKey}|${userId}`)) % buckets;
}

/** 0 → `a`, 1 → `b` … — `notification_logs.type` 같은 기록에 남기는 그룹 표기 */
export function bucketLabel(bucket: number): string {
  return String.fromCharCode(97 + bucket);
}

/** FNV-1a 32bit(부호 없는 정수) */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;

  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}

/** murmur3 마무리 섞기 — 32bit 전체를 고르게 흩는다 */
function fmix32(input: number): number {
  let hash = input;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;

  return hash >>> 0;
}
