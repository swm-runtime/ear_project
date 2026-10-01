import { ListMetrics, RankingMetrics } from './recommend-eval.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "신규"로 보는 발행 후 경과일 */
export const FRESH_WINDOW_DAYS = 14;

/** 백테스트가 보는 순위 컷 — 2는 하루 정규 편수다 */
export const HIT_KS = [2, 5, 10] as const;

/**
 * 순위 목록 → 적중률·MRR. 순위는 1부터이고, **후보에 없던 정답은 `null`**(모든 K에서 빗나간 것으로 센다).
 */
export function rankingMetrics(
  ranks: (number | null)[],
  ks: readonly number[] = HIT_KS,
): RankingMetrics {
  const total = ranks.length;
  const hitAt: Record<string, number> = {};

  for (const k of ks) {
    hitAt[String(k)] =
      total === 0
        ? 0
        : ranks.filter((rank) => rank !== null && rank <= k).length / total;
  }

  const mrr =
    total === 0
      ? 0
      : ranks.reduce<number>(
          (sum, rank) => sum + (rank === null ? 0 : 1 / rank),
          0,
        ) / total;

  return { hitAt, mrr };
}

/**
 * 후보 n편에서 정답 하나를 무작위로 세웠을 때의 기대값 — 적중률은 `min(K, n) / n`, 역순위는 `H_n / n`.
 * `n`이 `null`이면 정답이 후보에 없던 사례다(0).
 */
export function randomRankingMetrics(
  poolSizes: (number | null)[],
  ks: readonly number[] = HIT_KS,
): RankingMetrics {
  const total = poolSizes.length;
  const hitAt: Record<string, number> = {};

  for (const k of ks) {
    hitAt[String(k)] =
      total === 0
        ? 0
        : poolSizes.reduce<number>(
            (sum, n) => sum + (n === null || n === 0 ? 0 : Math.min(k, n) / n),
            0,
          ) / total;
  }

  const mrr =
    total === 0
      ? 0
      : poolSizes.reduce<number>((sum, n) => {
          if (n === null || n === 0) {
            return sum;
          }

          let harmonic = 0;

          for (let i = 1; i <= n; i += 1) {
            harmonic += 1 / i;
          }

          return sum + harmonic / n;
        }, 0) / total;

  return { hitAt, mrr };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]).size;

  if (union === 0) {
    return 0;
  }

  return [...setA].filter((value) => setB.has(value)).length / union;
}

export interface PickedItem {
  contentId: string;
  topicIds: string[];
  embedding: number[] | null;
  publishedAt: Date;
  /** 편성 시점의 전 사용자 편성 이력 수 */
  exposureCount: number;
}

/**
 * 편성분 지표 누적기 — 계산 한 번(사용자 한 명의 하루치)마다 `add`하고 끝에 `finish`한다.
 * 지표 정의는 `docs/backend/recommendation-evaluation.md` 4장.
 */
export class ListAccumulator {
  private plans = 0;
  private exhausted = 0;
  private topicDiversitySum = 0;
  private topicDiversityCount = 0;
  private distanceSum = 0;
  private distanceCount = 0;
  private picks = 0;
  private fresh = 0;
  private zeroExposure = 0;
  private readonly pickedContentIds = new Set<string>();
  private readonly picksByUser = new Map<string, Set<string>>();
  private readonly autoExpand: Record<string, number> = {};

  add(input: {
    userKey: string;
    now: Date;
    /** 정규 목표 편수 — 고갈 판정의 분모 */
    regularTarget: number;
    regularPicks: number;
    picks: PickedItem[];
    autoExpandAction: string | null;
  }): void {
    this.plans += 1;

    if (input.regularTarget > 0 && input.regularPicks < input.regularTarget) {
      this.exhausted += 1;
    }

    if (input.autoExpandAction !== null) {
      this.autoExpand[input.autoExpandAction] =
        (this.autoExpand[input.autoExpandAction] ?? 0) + 1;
    }

    if (input.picks.length > 0) {
      const topics = new Set(input.picks.flatMap((pick) => pick.topicIds));
      this.topicDiversitySum += Math.min(1, topics.size / input.picks.length);
      this.topicDiversityCount += 1;
    }

    const embedded = input.picks.filter((pick) => pick.embedding !== null);

    for (let i = 0; i < embedded.length; i += 1) {
      for (let j = i + 1; j < embedded.length; j += 1) {
        this.distanceSum +=
          1 - cosine(embedded[i].embedding!, embedded[j].embedding!);
        this.distanceCount += 1;
      }
    }

    const userPicks = this.picksByUser.get(input.userKey) ?? new Set<string>();

    for (const pick of input.picks) {
      this.picks += 1;
      this.pickedContentIds.add(pick.contentId);
      userPicks.add(pick.contentId);

      if (
        input.now.getTime() - pick.publishedAt.getTime() <=
        FRESH_WINDOW_DAYS * MS_PER_DAY
      ) {
        this.fresh += 1;
      }

      if (pick.exposureCount === 0) {
        this.zeroExposure += 1;
      }
    }

    this.picksByUser.set(input.userKey, userPicks);
  }

  finish(catalogSize: number): ListMetrics {
    const users = [...this.picksByUser.values()]
      .map((set) => [...set])
      .filter((ids) => ids.length > 0);
    let overlapSum = 0;
    let overlapCount = 0;

    for (let i = 0; i < users.length; i += 1) {
      for (let j = i + 1; j < users.length; j += 1) {
        overlapSum += jaccard(users[i], users[j]);
        overlapCount += 1;
      }
    }

    const ratio = (numerator: number, denominator: number) =>
      denominator === 0 ? 0 : numerator / denominator;

    return {
      plans: this.plans,
      exhaustionRate: ratio(this.exhausted, this.plans),
      topicDiversity: ratio(this.topicDiversitySum, this.topicDiversityCount),
      intraListDistance:
        this.distanceCount === 0 ? null : this.distanceSum / this.distanceCount,
      freshShare: ratio(this.fresh, this.picks),
      zeroExposureShare: ratio(this.zeroExposure, this.picks),
      catalogCoverage: ratio(this.pickedContentIds.size, catalogSize),
      userOverlap: overlapCount === 0 ? null : overlapSum / overlapCount,
      autoExpand: { ...this.autoExpand },
    };
  }
}
