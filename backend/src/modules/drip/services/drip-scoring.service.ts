import { Injectable } from '@nestjs/common';

import { ContentDifficulty } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';

import {
  AXIS_WEIGHT_META,
  AXIS_WEIGHT_SIGNAL,
  DISCOVERY_ITEM_WEIGHTS,
  DISCOVERY_QUALITY_FLOOR_RATE,
  FRESHNESS_HALF_LIFE_DAYS_DEFAULT,
  FRESHNESS_HALF_LIFE_DAYS_TIMELY,
  GLOBAL_COMPLETE_RATE_FALLBACK,
  META_ITEM_WEIGHTS,
  META_ITEM_WEIGHTS_COLD_START,
  POPULARITY_PLAY_COUNT_LOG_CAP,
  POPULARITY_SMOOTHING_C,
  SIGNAL_ITEM_WEIGHTS,
} from '../drip.constant';
import {
  DiscoverySelectionInput,
  RegularScoringContext,
  ScoredCandidate,
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
 * **① 임베딩 유사도 축은 아직 없다** — 모델·차원 미확정(domain.md 15.1 #11)이라
 * ②(신호 선호)·③(메타 규칙) 두 축을 재정규화해 쓴다(4.2의 결여 축 규칙). 같은 이유로
 * 다양성 제약도 MMR이 아니라 이산 규칙 폴백(같은 주제·저자 회피)으로 동작한다(4.2-3).
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

        const axes: ScoreItem[] = [
          {
            score: this.signalAxisScore(candidate, context),
            weight: AXIS_WEIGHT_SIGNAL,
          },
          {
            score: this.metaAxisScore(
              candidate,
              context,
              poolAverageCompleteRate,
              isSeriesContinuation,
            ),
            weight: AXIS_WEIGHT_META,
          },
        ];

        return {
          ...candidate,
          score: weightedMean(axes) ?? 0,
          isSeriesContinuation,
        };
      })
      .sort(
        (a, b) => b.score - a.score || a.content.id.localeCompare(b.content.id),
      );
  }

  /**
   * 다양성 제약을 적용한 선정(4.2-3 — 이산 규칙 폴백).
   *
   * 이미 뽑힌 편과 주제·저자가 겹치지 않는 후보를 우선하되, **겹치지 않는 후보가 없으면
   * 최고점 후보로 채운다** — 규칙은 "같은 것만 나오지 않도록"이지 편수를 비우라는 것이
   * 아니다. 시리즈 연속 편은 예외로 겹침 검사를 받지 않는다.
   */
  selectWithDiversity(
    scored: ScoredCandidate[],
    count: number,
  ): ScoredCandidate[] {
    const picks: ScoredCandidate[] = [];
    const remaining = [...scored];

    while (picks.length < count && remaining.length > 0) {
      const pickedTopicIds = new Set(picks.flatMap((pick) => pick.topicIds));
      const pickedAuthors = new Set(
        picks
          .map((pick) => pick.content.authorName)
          .filter((author): author is string => author !== null),
      );

      const index = remaining.findIndex(
        (candidate) =>
          candidate.isSeriesContinuation ||
          (!candidate.topicIds.some((topicId) => pickedTopicIds.has(topicId)) &&
            (candidate.content.authorName === null ||
              !pickedAuthors.has(candidate.content.authorName))),
      );

      const [picked] = remaining.splice(index >= 0 ? index : 0, 1);
      picks.push(picked);
    }

    return picks;
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

    const eligible = input.candidates.filter((candidate) => {
      if (
        candidate.topicIds.some((topicId) => userRemovedTopicIds.has(topicId))
      ) {
        return false;
      }

      // 품질 최소선(4.8-3) — 표본 없는 신작은 스무딩이 풀 평균으로 끌어올려 통과시킨다
      return (
        this.smoothedCompleteRate(candidate, poolAverageCompleteRate) >=
        DISCOVERY_QUALITY_FLOOR_RATE
      );
    });

    const scored = eligible
      .map((candidate) => ({
        ...candidate,
        score: this.discoveryScore(candidate, input, poolAverageCompleteRate),
        isSeriesContinuation: false,
      }))
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

    // 관심 밖 우선(혼합 — 협의 2026-08-27), 각 풀 안에서는 정규 편과 주제가 겹치지 않는 것 우선
    for (const pool of [outside, inside]) {
      for (const preferNonOverlapping of [true, false]) {
        for (const candidate of pool) {
          if (picks.length >= input.count) {
            return picks;
          }

          if (picks.includes(candidate)) {
            continue;
          }

          const overlapsPicked = candidate.topicIds.some((topicId) =>
            pickedTopicIds.has(topicId),
          );

          if (preferNonOverlapping && overlapsPicked) {
            continue;
          }

          picks.push(candidate);
          candidate.topicIds.forEach((topicId) => pickedTopicIds.add(topicId));
        }
      }
    }

    return picks;
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
  private metaAxisScore(
    candidate: ScoringCandidate,
    context: RegularScoringContext,
    poolAverageCompleteRate: number,
    isSeriesContinuation: boolean,
  ): number {
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

    const items: ScoreItem[] = [
      {
        // 여러 관심 주제에 걸치면 가점(4.2 ③)
        score:
          matchedTopicCount === 0
            ? 0
            : Math.min(1, 0.6 + 0.2 * (matchedTopicCount - 1)),
        weight: weights.topicMatch,
      },
      {
        score: this.freshnessScore(content, context.now),
        weight: weights.freshness,
      },
      {
        score: this.popularityScore(candidate, poolAverageCompleteRate),
        weight: weights.popularity,
      },
      {
        score: this.difficultyFitScore(content, context),
        weight: weights.difficultyFit,
      },
      {
        // 시리즈 연속 편에만 존재하는 강한 가점 — 해당 없으면 항목 자체가 빠진다
        score: isSeriesContinuation ? 1 : null,
        weight: weights.seriesContinuity,
      },
      {
        score: 1 - fatigueOverlap,
        weight: weights.exposureFatigue,
      },
    ];

    return weightedMean(items) ?? 0;
  }

  private discoveryScore(
    candidate: ScoringCandidate,
    input: DiscoverySelectionInput,
    poolAverageCompleteRate: number,
  ): number {
    const exposureCount = input.exposureCounts.get(candidate.content.id) ?? 0;

    const items: ScoreItem[] = [
      {
        // 저노출일수록 1에 가깝다 — 이 슬롯의 존재 이유(4.8-2)
        score: 1 / (1 + exposureCount),
        weight: DISCOVERY_ITEM_WEIGHTS.lowExposure,
      },
      {
        score: this.freshnessScore(candidate.content, input.now),
        weight: DISCOVERY_ITEM_WEIGHTS.freshness,
      },
      {
        score: this.smoothedCompleteRate(candidate, poolAverageCompleteRate),
        weight: DISCOVERY_ITEM_WEIGHTS.quality,
      },
    ];

    return weightedMean(items) ?? 0;
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
