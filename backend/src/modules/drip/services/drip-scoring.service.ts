import { Injectable } from '@nestjs/common';

import { ContentDifficulty } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';

import {
  AXIS_WEIGHT_EMBEDDING,
  AXIS_WEIGHT_META,
  AXIS_WEIGHT_SIGNAL,
  DISCOVERY_ITEM_WEIGHTS,
  DISCOVERY_QUALITY_FLOOR_POOL_RATIO,
  DISCOVERY_QUALITY_FLOOR_RATE,
  DISCOVERY_QUALITY_MIN_PLAY_COUNT,
  FRESHNESS_HALF_LIFE_DAYS_DEFAULT,
  FRESHNESS_HALF_LIFE_DAYS_TIMELY,
  GLOBAL_COMPLETE_RATE_FALLBACK,
  META_ITEM_WEIGHTS,
  META_ITEM_WEIGHTS_COLD_START,
  MMR_DIVERSITY_LAMBDA,
  POPULARITY_PLAY_COUNT_LOG_CAP,
  POPULARITY_SMOOTHING_C,
  SIGNAL_ITEM_WEIGHTS,
} from '../drip.constant';
import {
  DiscoverySelectionInput,
  RegularScoringContext,
  ScoredCandidate,
  ScoreBreakdown,
  ScoringCandidate,
  UserPreferenceWeights,
} from '../drip.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 콜드스타트의 난이도 우선(`drip-scheduling.md` 4.4 — beginner 우선, NULL 중립) */
const COLD_START_DIFFICULTY_SCORES: Readonly<Record<string, number>> = {
  [ContentDifficulty.BEGINNER]: 1,
  [ContentDifficulty.INTERMEDIATE]: 0.5,
  [ContentDifficulty.ADVANCED]: 0.2,
};

/** 항목 하나 — `score`가 null이면 입력 결여로 축에서 빠지고 나머지가 재정규화된다(4.2) */
interface ScoreItem {
  score: number | null;
  weight: number;
}

/**
 * `drip-scheduling.md` 4.2의 3축 하이브리드 스코어링 — **순수 계산만 한다.**
 * 입력 조회·적립은 편성 배치 Orchestrator의 몫이다.
 *
 * ① 임베딩 유사도 축은 취향 벡터(4.3-1)와 후보 임베딩의 코사인 유사도다. 어느 한쪽이
 * 없으면 축이 빠지고 나머지가 재정규화된다(4.2의 결여 축 규칙) — 임베딩 미부여 상태의
 * 종전 동작(②·③ 재정규화)이 그대로 유지된다. 다양성 제약은 두 편 모두 임베딩이 있으면
 * MMR, 아니면 이산 규칙 폴백(같은 주제·저자 회피)이다(4.2-3).
 *
 * **커리어 적합도(4.2 ③)는 미구현이다** — 콘텐츠 쪽에 직군·연차 대응 데이터가 없어
 * 매칭할 입력 자체가 없다. 콘텐츠 메타가 생기면 항목을 추가한다.
 */
@Injectable()
export class DripScoringService {
  /**
   * 시리즈 회차 순서 필터(`drip-scheduling.md` 7 — "1편을 듣지 않은 사용자에게 3편을
   * 적립하지 않는다"). 단일 콘텐츠·1편은 통과, 중간 편은 직전 편을 완청했을 때만 통과.
   */
  filterEpisodeOrder(
    candidates: ScoringCandidate[],
    completedEpisodesBySeries: Map<string, number>,
  ): ScoringCandidate[] {
    return candidates.filter(({ content }) => {
      if (content.seriesId === null || content.episodeNo === null) {
        return true;
      }

      if (content.episodeNo === 1) {
        return true;
      }

      return (
        completedEpisodesBySeries.get(content.seriesId) ===
        content.episodeNo - 1
      );
    });
  }

  /** 정규 편성 스코어링(4.2) — 점수 내림차순으로 돌려준다 */
  scoreRegularCandidates(
    candidates: ScoringCandidate[],
    context: RegularScoringContext,
  ): ScoredCandidate[] {
    const poolAverageCompleteRate = this.poolAverageCompleteRate(candidates);

    return candidates
      .map((candidate) => {
        const isSeriesContinuation = this.isSeriesContinuation(
          candidate.content,
          context.completedEpisodesBySeries,
        );

        const embedding = this.embeddingAxisScore(candidate, context);
        const signal = this.signalAxisScore(candidate, context);
        const meta = this.metaAxisScore(
          candidate,
          context,
          poolAverageCompleteRate,
          isSeriesContinuation,
        );

        const axes: ScoreItem[] = [
          { score: embedding, weight: AXIS_WEIGHT_EMBEDDING },
          { score: signal, weight: AXIS_WEIGHT_SIGNAL },
          { score: meta.score, weight: AXIS_WEIGHT_META },
        ];

        return {
          ...candidate,
          score: weightedMean(axes) ?? 0,
          isSeriesContinuation,
          breakdown: {
            embedding,
            signal,
            meta: meta.score,
            metaItems: meta.items,
          },
        };
      })
      .sort(
        (a, b) => b.score - a.score || a.content.id.localeCompare(b.content.id),
      );
  }

  /**
   * 다양성 제약을 적용한 선정(4.2-3).
   *
   * 비교하는 두 편 모두 임베딩이 있으면 **MMR**로 판정한다 — `스코어 − λ × (이미 뽑은
   * 편과의 코사인 유사도 최댓값)`으로 재계산해 뽑는다. 어느 한 편이라도 임베딩이 없는
   * 비교는 종전 이산 규칙(같은 주제·저자 회피)으로 폴백한다.
   *
   * 이산 규칙에 걸리지 않는 후보를 우선하되, **그런 후보가 없으면 재계산 최고점 후보로
   * 채운다** — 규칙은 "같은 것만 나오지 않도록"이지 편수를 비우라는 것이 아니다.
   * 시리즈 연속 편은 예외다 — 겹침 검사도 MMR 감점도 받지 않는다.
   */
  selectWithDiversity(
    scored: ScoredCandidate[],
    count: number,
  ): ScoredCandidate[] {
    const picks: ScoredCandidate[] = [];
    const remaining = [...scored];

    while (picks.length < count && remaining.length > 0) {
      const ranked = remaining
        .map((candidate) => ({
          candidate,
          adjustedScore: this.diversityAdjustedScore(candidate, picks),
        }))
        .sort(
          (a, b) =>
            b.adjustedScore - a.adjustedScore ||
            a.candidate.content.id.localeCompare(b.candidate.content.id),
        );

      const preferred =
        ranked.find(
          (entry) => !this.conflictsDiscretely(entry.candidate, picks),
        ) ?? ranked[0];

      remaining.splice(remaining.indexOf(preferred.candidate), 1);
      picks.push(preferred.candidate);
    }

    return picks;
  }

  /** MMR 재계산 점수 — 시리즈 연속 편은 감점 예외, 임베딩 없는 비교는 감점 0 */
  private diversityAdjustedScore(
    candidate: ScoredCandidate,
    picks: ScoredCandidate[],
  ): number {
    if (candidate.isSeriesContinuation) {
      return candidate.score;
    }

    return mmrAdjustedScore(
      candidate,
      picks.flatMap((pick) =>
        pick.embedding === null ? [] : [pick.embedding],
      ),
    );
  }

  /** 이산 규칙(같은 주제·저자) — 두 편 모두 임베딩이 있는 비교는 MMR이 대신하므로 통과 */
  private conflictsDiscretely(
    candidate: ScoredCandidate,
    picks: ScoredCandidate[],
  ): boolean {
    if (candidate.isSeriesContinuation) {
      return false;
    }

    return picks.some((pick) => {
      if (candidate.embedding !== null && pick.embedding !== null) {
        return false;
      }

      return (
        candidate.topicIds.some((topicId) => pick.topicIds.includes(topicId)) ||
        (candidate.content.authorName !== null &&
          candidate.content.authorName === pick.content.authorName)
      );
    });
  }

  /**
   * 탐험 편성 선정(4.8) — 관심 밖(인접·미보유 주제) 우선 + 관심 안 저노출 포함(혼합),
   * 품질 최소선(스무딩 완청률) 미달 제외, 직접 해제 주제 제외.
   */
  selectDiscovery(input: DiscoverySelectionInput): ScoredCandidate[] {
    const poolAverageCompleteRate = this.poolAverageCompleteRate(
      input.candidates,
    );
    const activeTopicIds = new Set(input.activeTopicIds);
    const userRemovedTopicIds = new Set(input.userRemovedTopicIds);
    /**
     * 품질 하한(4.8-3)은 **풀에 상대적**이다 — `min(절대 하한, 후보들의 전형적 완청률 × 비율)`.
     * 절대 0.2 하나만 쓰면 카탈로그 전체 완청률이 그 아래인 시기에 스무딩이 전 후보를 풀 평균으로
     * 끌어내려 **탐험이 0편이 된다**(2026-09-10 실서버 — 콘텐츠 7편, 테스터 훑어보기). 하한의 목적은
     * "이 카탈로그 안에서 상대적으로 안 듣는 콘텐츠"를 빼는 것이므로 기준을 카탈로그에서 잡는다.
     *
     * 전형값은 후보별 스무딩 완청률의 **단순 평균**이다 — 재생 수 가중 평균(`poolAverageCompleteRate`)은
     * 재생이 몰린 한 편이 기준 자체를 끌고 가서 그 편이 "평균 이하"가 될 수 없다.
     */
    const smoothedRates = new Map(
      input.candidates.map((candidate) => [
        candidate.content.id,
        this.smoothedCompleteRate(candidate, poolAverageCompleteRate),
      ]),
    );
    const typicalCompleteRate =
      smoothedRates.size === 0
        ? 0
        : [...smoothedRates.values()].reduce((sum, rate) => sum + rate, 0) /
          smoothedRates.size;
    const qualityFloor = Math.min(
      DISCOVERY_QUALITY_FLOOR_RATE,
      typicalCompleteRate * DISCOVERY_QUALITY_FLOOR_POOL_RATIO,
    );

    const eligible = input.candidates.filter((candidate) => {
      if (
        candidate.topicIds.some((topicId) => userRemovedTopicIds.has(topicId))
      ) {
        return false;
      }

      // 표본이 모자라면 판정하지 않는다 — 근거 없이 빼면 신작 노출이라는 슬롯의 목적과 반대다
      if (candidate.playCount < DISCOVERY_QUALITY_MIN_PLAY_COUNT) {
        return true;
      }

      return (smoothedRates.get(candidate.content.id) ?? 0) >= qualityFloor;
    });

    const scored = eligible
      .map((candidate) => {
        const { score, breakdown } = this.discoveryScore(
          candidate,
          input,
          poolAverageCompleteRate,
        );

        return { ...candidate, score, isSeriesContinuation: false, breakdown };
      })
      .sort(
        (a, b) => b.score - a.score || a.content.id.localeCompare(b.content.id),
      );

    const outside = scored.filter(
      (candidate) =>
        !candidate.topicIds.some((topicId) => activeTopicIds.has(topicId)),
    );
    const inside = scored.filter((candidate) => !outside.includes(candidate));

    const picks: ScoredCandidate[] = [];
    const pickedTopicIds = new Set(input.pickedTopicIds);
    // 탐험 편도 MMR 비교 대상이다(4.2-3) — 정규 편 임베딩에서 시작해 뽑을 때마다 더한다
    const pickedEmbeddings = [...(input.pickedEmbeddings ?? [])];

    // 관심 밖 우선(혼합 — 협의 2026-08-27), 각 풀 안에서는 정규 편과 주제가 겹치지 않는 것 우선
    for (const pool of [outside, inside]) {
      for (const preferNonOverlapping of [true, false]) {
        for (;;) {
          if (picks.length >= input.count) {
            return picks;
          }

          const eligible = pool.filter(
            (candidate) =>
              !picks.includes(candidate) &&
              (!preferNonOverlapping ||
                !candidate.topicIds.some((topicId) =>
                  pickedTopicIds.has(topicId),
                )),
          );

          if (eligible.length === 0) {
            break;
          }

          // MMR 재계산 최고점을 뽑는다 — 임베딩이 없으면 감점 0이라 점수순과 같다
          const picked = eligible.reduce((best, candidate) =>
            mmrAdjustedScore(candidate, pickedEmbeddings) >
            mmrAdjustedScore(best, pickedEmbeddings)
              ? candidate
              : best,
          );

          picks.push(picked);
          picked.topicIds.forEach((topicId) => pickedTopicIds.add(topicId));

          if (picked.embedding !== null) {
            pickedEmbeddings.push(picked.embedding);
          }
        }
      }
    }

    return picks;
  }

  /**
   * ① 임베딩 유사도 축(4.2) — 취향 벡터(4.3-1)와 후보 임베딩의 코사인 유사도.
   * 콜드스타트·취향 벡터 없음·임베딩 없음이면 축이 빠진다(null — 4.2 재정규화,
   * 4.4 "취향 벡터가 없으므로 자연히 빠진다"). 유사도(-1~1)는 0~1로 접어 다른 축과
   * 스케일을 맞춘다.
   */
  private embeddingAxisScore(
    candidate: ScoringCandidate,
    context: RegularScoringContext,
  ): number | null {
    if (context.isColdStart || context.preference === null) {
      return null;
    }

    const taste = context.preference.tasteEmbedding;

    if (taste === null || candidate.embedding === null) {
      return null;
    }

    return (cosineSimilarity(taste, candidate.embedding) + 1) / 2;
  }

  /** ② 신호 선호 축 — 취향 가중치·콜드스타트가 없으면 축 자체가 빠진다(null) */
  private signalAxisScore(
    candidate: ScoringCandidate,
    context: RegularScoringContext,
  ): number | null {
    if (context.isColdStart || context.preference === null) {
      return null;
    }

    const preference = context.preference;
    const { content } = candidate;

    const items: ScoreItem[] = [
      {
        score: this.preferenceLookupScore(
          candidate.topicIds.map((topicId) => preference.topicWeights[topicId]),
        ),
        weight: SIGNAL_ITEM_WEIGHTS.topicPreference,
      },
      {
        score:
          content.authorName !== null &&
          preference.authorWeights[content.authorName] !== undefined
            ? squash(preference.authorWeights[content.authorName])
            : null,
        weight: SIGNAL_ITEM_WEIGHTS.authorPreference,
      },
      {
        score: this.keywordMatchScore(content, preference),
        weight: SIGNAL_ITEM_WEIGHTS.keywordMatch,
      },
      {
        score:
          content.format !== null &&
          Object.keys(preference.formatWeights).length > 0
            ? squash(preference.formatWeights[content.format] ?? 0)
            : null,
        weight: SIGNAL_ITEM_WEIGHTS.formatPreference,
      },
      {
        score: this.durationClosenessScore(content, preference),
        weight: SIGNAL_ITEM_WEIGHTS.durationCloseness,
      },
    ];

    return weightedMean(items);
  }

  /** ③ 메타 규칙 축 — 콜드스타트에서도 살아 있는 축(4.4) */
  /**
   * 메타 규칙 축(4.2 ③). **항목별 점수를 함께 돌려준다** — 최종 점수만 남기면
   * 어떤 항목이 죽어 있어도 겉으로는 정상으로 보인다(인기도 축이 그랬다).
   */
  private metaAxisScore(
    candidate: ScoringCandidate,
    context: RegularScoringContext,
    poolAverageCompleteRate: number,
    isSeriesContinuation: boolean,
  ): { score: number; items: ScoreBreakdown['metaItems'] } {
    const weights = context.isColdStart
      ? META_ITEM_WEIGHTS_COLD_START
      : META_ITEM_WEIGHTS;
    const { content } = candidate;

    const matchedTopicCount = candidate.topicIds.filter((topicId) =>
      context.activeTopicIds.includes(topicId),
    ).length;

    const recentTopicIds = new Set(context.recentDripTopicIds);
    const fatigueOverlap =
      candidate.topicIds.length === 0
        ? 0
        : candidate.topicIds.filter((topicId) => recentTopicIds.has(topicId))
            .length / candidate.topicIds.length;

    const scores: ScoreBreakdown['metaItems'] = {
      // 여러 관심 주제에 걸치면 가점(4.2 ③)
      topicMatch:
        matchedTopicCount === 0
          ? 0
          : Math.min(1, 0.6 + 0.2 * (matchedTopicCount - 1)),
      freshness: this.freshnessScore(content, context.now),
      popularity: this.popularityScore(candidate, poolAverageCompleteRate),
      difficultyFit: this.difficultyFitScore(content, context),
      // 시리즈 연속 편에만 존재하는 강한 가점 — 해당 없으면 항목 자체가 빠진다
      seriesContinuity: isSeriesContinuation ? 1 : null,
      exposureFatigue: 1 - fatigueOverlap,
    };

    const items: ScoreItem[] = [
      { score: scores.topicMatch, weight: weights.topicMatch },
      { score: scores.freshness, weight: weights.freshness },
      { score: scores.popularity, weight: weights.popularity },
      { score: scores.difficultyFit, weight: weights.difficultyFit },
      { score: scores.seriesContinuity, weight: weights.seriesContinuity },
      { score: scores.exposureFatigue, weight: weights.exposureFatigue },
    ];

    return { score: weightedMean(items) ?? 0, items: scores };
  }

  /** 탐험 슬롯 점수(4.8-2). 정규 편성과 축이 다르므로 항목도 따로 남긴다 */
  private discoveryScore(
    candidate: ScoringCandidate,
    input: DiscoverySelectionInput,
    poolAverageCompleteRate: number,
  ): { score: number; breakdown: ScoreBreakdown } {
    const exposureCount = input.exposureCounts.get(candidate.content.id) ?? 0;
    // 저노출일수록 1에 가깝다 — 이 슬롯의 존재 이유(4.8-2)
    const lowExposure = 1 / (1 + exposureCount);
    const freshness = this.freshnessScore(candidate.content, input.now);
    const quality = this.smoothedCompleteRate(
      candidate,
      poolAverageCompleteRate,
    );

    const items: ScoreItem[] = [
      { score: lowExposure, weight: DISCOVERY_ITEM_WEIGHTS.lowExposure },
      { score: freshness, weight: DISCOVERY_ITEM_WEIGHTS.freshness },
      { score: quality, weight: DISCOVERY_ITEM_WEIGHTS.quality },
    ];

    const score = weightedMean(items) ?? 0;

    return {
      score,
      breakdown: {
        // 탐험은 임베딩·신호 축을 쓰지 않는다 — 그 사실도 로그에 남는다
        embedding: null,
        signal: null,
        meta: score,
        metaItems: {
          topicMatch: null,
          freshness,
          popularity: quality,
          difficultyFit: null,
          seriesContinuity: null,
          // 저노출 가점을 노출 피로 자리에 싣는다 — 둘 다 "얼마나 덜 보였나"다
          exposureFatigue: lowExposure,
        },
      },
    };
  }

  /**
   * 인기도(4.2 ③) — **베이지안 스무딩 완청률**(개정 2026-08-27) + 재생 수 로그 성분.
   * 표본이 작을수록 풀 평균으로 끌려가, 재생 3회·완청 3회가 재생 1,000회·완청 850회를
   * 이기는 왜곡을 막는다.
   */
  private popularityScore(
    candidate: ScoringCandidate,
    poolAverageCompleteRate: number,
  ): number {
    const playScore = Math.min(
      1,
      Math.log10(1 + candidate.playCount) / POPULARITY_PLAY_COUNT_LOG_CAP,
    );

    return (
      0.7 * this.smoothedCompleteRate(candidate, poolAverageCompleteRate) +
      0.3 * playScore
    );
  }

  private smoothedCompleteRate(
    candidate: ScoringCandidate,
    poolAverageCompleteRate: number,
  ): number {
    return (
      (candidate.completeCount +
        POPULARITY_SMOOTHING_C * poolAverageCompleteRate) /
      (candidate.playCount + POPULARITY_SMOOTHING_C)
    );
  }

  /**
   * 신선도(4.2 ③) — `is_evergreen` 정밀화: 에버그린은 감점 없음, 시의성은 감쇠 강화,
   * NULL은 종전 단일 감쇠.
   */
  private freshnessScore(content: Content, now: Date): number {
    if (content.isEvergreen === true) {
      return 1;
    }

    const halfLifeDays =
      content.isEvergreen === false
        ? FRESHNESS_HALF_LIFE_DAYS_TIMELY
        : FRESHNESS_HALF_LIFE_DAYS_DEFAULT;

    const ageDays =
      Math.max(0, now.getTime() - content.publishedAt.getTime()) / MS_PER_DAY;

    return Math.pow(0.5, ageDays / halfLifeDays);
  }

  /** 난이도 적합도(4.2 ③) — 콜드스타트는 beginner 우선(4.4), 이후는 완청 분포 매칭 */
  private difficultyFitScore(
    content: Content,
    context: RegularScoringContext,
  ): number | null {
    if (content.difficulty === null) {
      return null;
    }

    if (context.isColdStart) {
      return COLD_START_DIFFICULTY_SCORES[content.difficulty] ?? null;
    }

    if (
      context.difficultyAffinity === null ||
      Object.keys(context.difficultyAffinity).length === 0
    ) {
      return null;
    }

    return context.difficultyAffinity[content.difficulty] ?? 0;
  }

  private keywordMatchScore(
    content: Content,
    preference: UserPreferenceWeights,
  ): number | null {
    if (
      content.keywords === null ||
      Object.keys(preference.keywordWeights).length === 0
    ) {
      return null;
    }

    const matchedWeightSum = content.keywords.reduce(
      (sum, keyword) => sum + (preference.keywordWeights[keyword] ?? 0),
      0,
    );

    return squash(matchedWeightSum);
  }

  private durationClosenessScore(
    content: Content,
    preference: UserPreferenceWeights,
  ): number | null {
    if (preference.durationPref === null || content.durationSec <= 0) {
      return null;
    }

    const median = Math.max(1, preference.durationPref.median_sec);

    return Math.max(0, 1 - Math.abs(content.durationSec - median) / median);
  }

  /** 취향 맵 조회값들의 평균 → squash. 조회 대상이 하나도 없으면 항목 결여(null) */
  private preferenceLookupScore(values: (number | undefined)[]): number | null {
    const present = values.filter(
      (value): value is number => value !== undefined,
    );

    if (present.length === 0) {
      return null;
    }

    return squash(
      present.reduce((sum, value) => sum + value, 0) / present.length,
    );
  }

  private isSeriesContinuation(
    content: Content,
    completedEpisodesBySeries: Map<string, number>,
  ): boolean {
    return (
      content.seriesId !== null &&
      content.episodeNo !== null &&
      completedEpisodesBySeries.get(content.seriesId) === content.episodeNo - 1
    );
  }

  private poolAverageCompleteRate(candidates: ScoringCandidate[]): number {
    const totalPlay = candidates.reduce(
      (sum, candidate) => sum + candidate.playCount,
      0,
    );

    if (totalPlay === 0) {
      return GLOBAL_COMPLETE_RATE_FALLBACK;
    }

    const totalComplete = candidates.reduce(
      (sum, candidate) => sum + candidate.completeCount,
      0,
    );

    return totalComplete / totalPlay;
  }
}

/**
 * 입력이 없는 항목(null)을 빼고 나머지 가중치를 재정규화한 가중 평균(4.2).
 * 모든 항목이 null이면 null — 호출부가 축 결여로 처리한다.
 */
function weightedMean(items: ScoreItem[]): number | null {
  const present = items.filter(
    (item): item is { score: number; weight: number } => item.score !== null,
  );

  const totalWeight = present.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight === 0) {
    return null;
  }

  return (
    present.reduce((sum, item) => sum + item.score * item.weight, 0) /
    totalWeight
  );
}

/** 무한 범위의 누적 가중치를 0~1로 접는다(0 → 0.5, 음수 → 0.5 미만) */
function squash(value: number): number {
  return 0.5 + 0.5 * Math.tanh(value);
}

/** 탐험 선정의 MMR 재계산(4.2-3) — 임베딩이 없거나 비교 대상이 없으면 감점 없음 */
function mmrAdjustedScore(
  candidate: ScoredCandidate,
  pickedEmbeddings: number[][],
): number {
  if (candidate.embedding === null) {
    return candidate.score;
  }

  let maxSimilarity = 0;

  for (const embedding of pickedEmbeddings) {
    maxSimilarity = Math.max(
      maxSimilarity,
      cosineSimilarity(candidate.embedding, embedding),
    );
  }

  return candidate.score - MMR_DIVERSITY_LAMBDA * maxSimilarity;
}

/**
 * 코사인 유사도(domain.md 5.6 — 지표는 코사인으로 확정). 저장 벡터는 정규화 전제지만
 * 방어적으로 노름을 나눈다 — 0 벡터가 섞여도 NaN 대신 0(무관)으로 처리한다.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / Math.sqrt(normA * normB);
}
