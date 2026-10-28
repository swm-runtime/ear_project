import {
  InsightsCompletionByLength,
  InsightsCompletionContentPoint,
  InsightsCompletionContentRow,
  InsightsCompletionTrend,
} from '../admin.types';

/**
 * 길이별 완청률(`GET /admin/insights/completion-by-length`)의 순수 계산. 편마다 시작한 사람이 적어 날것의 비율(11분짜리 한 편에
 * 2명 시작·0명 완청 → 0%)은 길이와 상관없이 크게 흔들린다. 그래서 두 가지로 본다.
 *
 * 1. **추세 — 로지스틱 회귀**: (사용자, 편) 하나하나를 "완청했나"(0/1)로 두고 `logit(완청 확률) = b0 + b1 × 길이(분)`를 맞춘다.
 *    시작한 사람이 많은 편이 그만큼 무게를 갖고, 한두 명짜리 편은 선을 거의 움직이지 못한다. `b1`을 "5분 길어지면 완청 오즈가
 *    몇 배"로 읽는다. 같은 편을 들은 사람끼리는 독립이 아니라(주제·품질이 같다) 구간이 실제보다 좁게 나오므로 **과분산 보정**
 *    (피어슨 χ² / 자유도)만큼 표준오차를 넓힌다. 95% 구간이 1 을 넘지 않으면 "길수록 떨어진다"고 판정한다.
 * 2. **편별 점 — 경험적 베이즈 축소**: 편의 비율을 전체 평균 쪽으로 당긴다 — `(완청 + k·p0) / (시작 + k)`. 시작한 사람이 k 보다
 *    훨씬 많은 편은 거의 그대로, 적은 편은 평균 가까이 간다. k 는 편별 비율이 실제로 퍼진 정도에서 추정한다(적률법).
 *
 * 길이는 원인 하나일 뿐이다 — 긴 편이 다른 주제·시리즈에 몰려 있으면 그 차이도 기울기에 섞인다(화면이 함께 적는다).
 */

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** 축소 강도 k 의 범위 — 편이 적어 추정이 튀는 것을 막는다 */
const PRIOR_STRENGTH_MIN = 2;
const PRIOR_STRENGTH_MAX = 500;
const Z95 = 1.96;

/**
 * 축소 강도 k(적률법). 편별 비율의 퍼짐(관측 분산)에서 표본이 적어 생기는 몫(이항 분산 `p0(1-p0)/n`)을 빼면 편끼리 실제로
 * 다른 몫 τ² 이 남는다. 베타 사전분포에서 `τ² = p0(1-p0)/(k+1)` → `k = p0(1-p0)/τ² - 1`. τ² 이 0 이하(차이가 다 우연)면 상한.
 * 퍼짐은 **시작한 사람 수로 가중**한다 — 가중하지 않으면 한두 명짜리 편의 0%·100% 가 퍼짐과 잡음을 함께 부풀려 k 가 튄다.
 * 가중 관측 분산 `Σn(r-p0)² / Σn` 의 잡음 몫은 `p0(1-p0) × 편 수 / Σn` 이다.
 */
export function estimatePriorStrength(
  rows: readonly InsightsCompletionContentRow[],
  overallRate: number,
): number {
  const used = rows.filter((r) => r.starters > 0);
  if (used.length < 2 || overallRate <= 0 || overallRate >= 1) {
    return PRIOR_STRENGTH_MAX;
  }
  const base = overallRate * (1 - overallRate);
  const total = used.reduce((s, r) => s + r.starters, 0);
  const observed =
    used.reduce(
      (s, r) => s + r.starters * (r.completers / r.starters - overallRate) ** 2,
      0,
    ) / total;
  const noise = (base * used.length) / total;
  const between = observed - noise;
  if (between <= 0) return PRIOR_STRENGTH_MAX;
  return Math.min(
    PRIOR_STRENGTH_MAX,
    Math.max(PRIOR_STRENGTH_MIN, base / between - 1),
  );
}

/**
 * 묶은 이항 자료의 로지스틱 회귀(뉴턴-랩슨 = IRLS). 길이는 평균으로 중심화해 수치를 안정시킨다.
 * 편이 `minContents`보다 적거나, 길이가 다 같거나, 전원 완청·전원 미완청이면 기울기를 정할 수 없어 null.
 */
export function fitLengthTrend(
  rows: readonly InsightsCompletionContentRow[],
  options: { slopeStepMin: number; minContents: number },
): InsightsCompletionTrend | null {
  const used = rows.filter((r) => r.starters > 0);
  if (used.length < options.minContents) return null;
  const n = used.reduce((s, r) => s + r.starters, 0);
  const c = used.reduce((s, r) => s + r.completers, 0);
  if (c === 0 || c === n) return null;
  const minutes = used.map((r) => r.durationSec / 60);
  const center = used.reduce((s, r, i) => s + r.starters * minutes[i], 0) / n;
  const xs = minutes.map((m) => m - center);
  if (xs.every((x) => Math.abs(x) < 1e-9)) return null;

  let b0 = Math.log(c / (n - c));
  let b1 = 0;
  let h00 = 0;
  let h01 = 0;
  let h11 = 0;
  for (let iter = 0; iter < 50; iter += 1) {
    let g0 = 0;
    let g1 = 0;
    h00 = 0;
    h01 = 0;
    h11 = 0;
    used.forEach((r, i) => {
      const mu = sigmoid(b0 + b1 * xs[i]);
      const resid = r.completers - r.starters * mu;
      const w = r.starters * mu * (1 - mu);
      g0 += resid;
      g1 += resid * xs[i];
      h00 += w;
      h01 += w * xs[i];
      h11 += w * xs[i] * xs[i];
    });
    const det = h00 * h11 - h01 * h01;
    if (det <= 0) return null;
    const d0 = (h11 * g0 - h01 * g1) / det;
    const d1 = (h00 * g1 - h01 * g0) / det;
    b0 += d0;
    b1 += d1;
    if (Math.abs(d0) < 1e-10 && Math.abs(d1) < 1e-10) break;
  }
  const det = h00 * h11 - h01 * h01;
  if (det <= 0) return null;
  // 정보 행렬의 역 — 공분산
  const v00 = h11 / det;
  const v01 = -h01 / det;
  const v11 = h00 / det;

  // 과분산 — 피어슨 χ² / (편 수 - 2). 1 아래는 1(구간을 좁히지는 않는다)
  const chi2 = used.reduce((s, r, i) => {
    const mu = sigmoid(b0 + b1 * xs[i]);
    const variance = r.starters * mu * (1 - mu);
    return variance > 0
      ? s + (r.completers - r.starters * mu) ** 2 / variance
      : s;
  }, 0);
  const dispersion = Math.max(1, chi2 / Math.max(1, used.length - 2));

  const se1 = Math.sqrt(v11 * dispersion);
  const step = options.slopeStepMin;
  const oddsRatioLow = Math.exp(step * (b1 - Z95 * se1));
  const oddsRatioHigh = Math.exp(step * (b1 + Z95 * se1));

  const from = Math.floor(Math.min(...minutes));
  const to = Math.ceil(Math.max(...minutes));
  const curve = [];
  for (let minute = from; minute <= to; minute += 1) {
    const x = minute - center;
    const eta = b0 + b1 * x;
    const se = Math.sqrt((v00 + 2 * x * v01 + x * x * v11) * dispersion);
    curve.push({
      minute,
      rate: sigmoid(eta),
      low: sigmoid(eta - Z95 * se),
      high: sigmoid(eta + Z95 * se),
    });
  }

  return {
    oddsRatioPerStep: Math.exp(step * b1),
    oddsRatioLow,
    oddsRatioHigh,
    direction: oddsRatioHigh < 1 ? 'down' : oddsRatioLow > 1 ? 'up' : 'flat',
    dispersion,
    curve,
  };
}

/** 편별 원본 → 축소값·추세까지 붙인 응답 재료 */
export function summarizeCompletionByLength(
  rows: readonly InsightsCompletionContentRow[],
  now: Date,
  options: { slopeStepMin: number; minContents: number },
): InsightsCompletionByLength {
  const starters = rows.reduce((s, r) => s + r.starters, 0);
  const completers = rows.reduce((s, r) => s + r.completers, 0);
  const overallRate = starters > 0 ? completers / starters : null;
  const k =
    overallRate === null ? null : estimatePriorStrength(rows, overallRate);
  const contents: InsightsCompletionContentPoint[] = rows
    .filter((r) => r.starters > 0)
    .map((r) => ({
      ...r,
      rawRate: r.completers / r.starters,
      shrunkRate:
        overallRate === null || k === null
          ? r.completers / r.starters
          : (r.completers + k * overallRate) / (r.starters + k),
    }));
  return {
    generatedAt: now,
    overallRate,
    priorStrength: k,
    starters,
    completers,
    contents,
    trend: fitLengthTrend(rows, options),
  };
}
