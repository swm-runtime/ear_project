/**
 * 곡선 그라데이션(easing gradient) — 직선 두 점 그라데이션은 시작·끝에서 꺾여 띠처럼 보인다. 곡선(smoothstep)을 점 여러 개로
 * 근사해 자연스럽게 녹인다(머티리얼 scrim 가이드·larsenwork easing-gradients 와 같은 방식 — 점이 적으면 계단이 보여 16개)
 */
export const smoothstep = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

export interface EasedGradient {
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
}

/** `rgb`('23, 23, 26' 꼴)의 불투명도를 `from` → `to` 로 S 곡선을 따라 바꾸는 그라데이션 점들 */
export const easedAlphaGradient = (
  rgb: string,
  from: number,
  to: number,
  steps = 16,
): EasedGradient => {
  const colors: string[] = [];
  const locations: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const alpha = from + (to - from) * smoothstep(t);
    colors.push(`rgba(${rgb}, ${Math.round(alpha * 1000) / 1000})`);
    locations.push(t);
  }
  return {
    colors: colors as unknown as EasedGradient['colors'],
    locations: locations as unknown as EasedGradient['locations'],
  };
};
