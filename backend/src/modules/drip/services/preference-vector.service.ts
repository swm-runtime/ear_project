import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { Content } from '@/modules/content/entities/content.entity';

import {
  PREFERENCE_WEIGHT_MAP_LIMIT,
  SIGNAL_ACTION_WEIGHTS,
  SIGNAL_RECENCY_HALF_LIFE_DAYS,
} from '../drip.constant';
import { PreferenceSignalAction } from '../drip.enum';
import {
  DurationPref,
  PreferenceSignalInput,
  UserPreferenceWeights,
} from '../drip.types';
import { UserPreferenceVectorRepository } from '../repositories/user-preference-vector.repository';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 완청 길이 분포에 들어가는 긍정 신호 — 길이 취향은 끝까지 들은 것에서만 읽힌다 */
const DURATION_SOURCE_ACTIONS: readonly PreferenceSignalAction[] = [
  PreferenceSignalAction.COMPLETE,
  PreferenceSignalAction.REPLAY,
];

/**
 * `user_preference_vectors`(domain.md 7.2)의 재계산을 소유한다.
 *
 * 신호 해석(`drip-scheduling.md` 4.3)의 구현이다 — 신호별 가중 × 최근성 감쇠를
 * 주제·저자·키워드·형식 가중치와 완청 길이 분포로 접는다. **부정 신호(unsave·delete)는
 * 음수 가중치로 쌓인다** — 스코어링의 "부정 신호 회피"가 이 음수를 그대로 읽는다(4.2 ②).
 *
 * 원천(`user_signals`)의 소유자는 playback이므로 신호는 조립된 형태로 받는다
 * (`drip → playback` 의존은 순환이라 만들 수 없다 — architecture.md 4.5).
 */
@Injectable()
export class PreferenceVectorService {
  constructor(
    private readonly userPreferenceVectorRepository: UserPreferenceVectorRepository,
  ) {}

  /**
   * 배치 시점 전체 재계산 + 저장(`drip-scheduling.md` 4.3 — 실시간 재계산은 하지 않는다).
   *
   * @param completeSignalCount 콜드스타트 판정용 **전체 기간** 완청 신호 수 —
   *   최근 조회 창(`SIGNAL_LOOKBACK_DAYS`)과 무관하게 원천에서 센 값을 받는다
   */
  async rebuild(
    userId: string,
    signals: PreferenceSignalInput[],
    contentsById: Map<string, Content>,
    topicIdsByContentId: Map<string, string[]>,
    completeSignalCount: number,
    now: Date,
    manager?: EntityManager,
  ): Promise<UserPreferenceWeights> {
    const weights = this.compute(
      signals,
      contentsById,
      topicIdsByContentId,
      completeSignalCount,
      now,
    );

    await this.userPreferenceVectorRepository.upsert(
      {
        userId,
        topicWeights: weights.topicWeights,
        authorWeights: weights.authorWeights,
        keywordWeights: weights.keywordWeights,
        formatWeights: weights.formatWeights,
        durationPref: weights.durationPref,
        signalCount: weights.signalCount,
      },
      manager,
    );

    return weights;
  }

  async findWeights(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserPreferenceWeights | null> {
    const vector = await this.userPreferenceVectorRepository.findByUserId(
      userId,
      manager,
    );

    if (!vector) {
      return null;
    }

    return {
      topicWeights: vector.topicWeights,
      authorWeights: vector.authorWeights,
      keywordWeights: vector.keywordWeights,
      formatWeights: vector.formatWeights,
      durationPref: vector.durationPref,
      signalCount: vector.signalCount,
    };
  }

  async purgeByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.userPreferenceVectorRepository.deleteByUserId(userId, manager);
  }

  /** 순수 계산부 — 테스트는 이 경로로 저장 없이 검증한다 */
  compute(
    signals: PreferenceSignalInput[],
    contentsById: Map<string, Content>,
    topicIdsByContentId: Map<string, string[]>,
    completeSignalCount: number,
    now: Date,
  ): UserPreferenceWeights {
    const topicWeights: Record<string, number> = {};
    const authorWeights: Record<string, number> = {};
    const keywordWeights: Record<string, number> = {};
    const formatWeights: Record<string, number> = {};
    const completedDurations: number[] = [];

    for (const signal of signals) {
      const base = SIGNAL_ACTION_WEIGHTS[signal.action] ?? 0;

      if (base === 0) {
        continue;
      }

      const content = contentsById.get(signal.contentId);

      if (!content) {
        continue;
      }

      const weight = base * this.recencyDecay(signal.createdAt, now);

      for (const topicId of topicIdsByContentId.get(signal.contentId) ?? []) {
        topicWeights[topicId] = (topicWeights[topicId] ?? 0) + weight;
      }

      if (content.authorName) {
        authorWeights[content.authorName] =
          (authorWeights[content.authorName] ?? 0) + weight;
      }

      // 추천 메타가 NULL인 콘텐츠는 해당 집계에서 제외한다 (`drip-scheduling.md` 4.3)
      for (const keyword of content.keywords ?? []) {
        keywordWeights[keyword] = (keywordWeights[keyword] ?? 0) + weight;
      }

      if (content.format) {
        formatWeights[content.format] =
          (formatWeights[content.format] ?? 0) + weight;
      }

      if (
        DURATION_SOURCE_ACTIONS.includes(signal.action) &&
        content.durationSec > 0
      ) {
        completedDurations.push(content.durationSec);
      }
    }

    return {
      topicWeights: pruneWeights(topicWeights),
      authorWeights: pruneWeights(authorWeights),
      keywordWeights: pruneWeights(keywordWeights),
      formatWeights: pruneWeights(formatWeights),
      durationPref: toDurationPref(completedDurations),
      signalCount: completeSignalCount,
    };
  }

  /** 최근성 가중(4.3) — 반감기 지수 감쇠. 미래 시각(시계 오차)은 감쇠 없음으로 본다 */
  private recencyDecay(signalAt: Date, now: Date): number {
    const ageDays =
      Math.max(0, now.getTime() - signalAt.getTime()) / MS_PER_DAY;

    return Math.pow(0.5, ageDays / SIGNAL_RECENCY_HALF_LIFE_DAYS);
  }
}

/** 절대값 상위 N개만 남긴다 — 키워드 맵이 이력에 비례해 자라는 것을 막는다 */
function pruneWeights(weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, value]) => value !== 0);

  if (entries.length <= PREFERENCE_WEIGHT_MAP_LIMIT) {
    return Object.fromEntries(entries);
  }

  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .slice(0, PREFERENCE_WEIGHT_MAP_LIMIT),
  );
}

function toDurationPref(durations: number[]): DurationPref | null {
  if (durations.length === 0) {
    return null;
  }

  const sorted = [...durations].sort((a, b) => a - b);

  return {
    median_sec: percentile(sorted, 0.5),
    p25_sec: percentile(sorted, 0.25),
    p75_sec: percentile(sorted, 0.75),
  };
}

function percentile(sortedAsc: number[], ratio: number): number {
  const index = Math.min(
    sortedAsc.length - 1,
    Math.floor(sortedAsc.length * ratio),
  );

  return sortedAsc[index];
}
