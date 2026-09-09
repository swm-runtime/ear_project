import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { toPreviousFinalMonthStart } from '@/common/utils/service-date.util';

import { ALL_TIME_PERIOD_START, StatsPeriodType } from '../content.enum';
import { ContentStatRepository } from '../repositories/content-stat.repository';

/**
 * `content_stats`는 content 모듈 소유다(domain.md 2장).
 *
 * **집계 배치는 `playback` 모듈이 실행한다** — 집계 원천(`play_records` · `user_signals`)을
 * 그 모듈이 소유하기 때문이다. 이 Service는 읽기(순위·표본 판정)만 제공한다.
 */
@Injectable()
export class ContentStatService {
  constructor(private readonly contentStatRepository: ContentStatRepository) {}

  /**
   * 콘텐츠별 전체 구간 재생·완청 수 — 편성 스코어링의 인기도 입력(`drip-scheduling.md` 4.2 ③).
   * 집계 행이 없는 콘텐츠는 맵에 없다(호출부가 0으로 취급한다).
   */
  async findAllTimeCounts(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, { playCount: number; completeCount: number }>> {
    const stats = await this.contentStatRepository.findAllTimeByContentIds(
      contentIds,
      ALL_TIME_PERIOD_START,
      manager,
    );

    return new Map(
      stats.map((stat) => [
        stat.contentId,
        { playCount: stat.playCount, completeCount: stat.completeCount },
      ]),
    );
  }

  /** 직전 확정 월 기준 상위 콘텐츠 ID (재생 수 내림차순) */
  async findMonthlyPopularContentIds(
    now: Date,
    limit: number,
    manager?: EntityManager,
  ): Promise<string[]> {
    return this.contentStatRepository.findTopContentIds(
      StatsPeriodType.MONTH,
      toPreviousFinalMonthStart(now),
      limit,
      manager,
    );
  }
}
