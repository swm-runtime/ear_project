import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { toPreviousFinalMonthStart } from '@/common/utils/service-date.util';

import { MONTHLY_POPULAR_SAMPLE_THRESHOLD } from '../content.constant';
import { StatsPeriodType } from '../content.enum';
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
   * onboarding.md 4 [3] — 직전 확정 월의 재생 합계가 기준값 미만이면 표본 부족이다.
   *
   * 표본이 부족하면 인기 순위 대신 랜덤 3건을 같은 자리에 배치하고, 섹션 제목도 바꾼다.
   * "인기 순위가 아닌 것을 인기라고 부르면 사실과 다른 표시가 된다."
   */
  async isMonthlySampleSufficient(
    now: Date,
    manager?: EntityManager,
  ): Promise<boolean> {
    const total = await this.contentStatRepository.sumPlayCount(
      StatsPeriodType.MONTH,
      toPreviousFinalMonthStart(now),
      manager,
    );

    return total >= MONTHLY_POPULAR_SAMPLE_THRESHOLD;
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
