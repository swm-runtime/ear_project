import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ContentStatAggregationService } from './services/content-stat-aggregation.service';

/**
 * `content_stats` 집계 배치의 실행 시각(domain.md 5.4 — B-6).
 *
 * 문서는 `week` 매주 월요일 04:00 · `month` 매달 1일 04:00으로 나눠 적었으나, **매일
 * 04:00에 한 번 돌린다.** 재집계 upsert라 몇 번 돌아도 결과가 같고, 주·월 배치를 따로
 * 두면 그 하루에만 도는 잡이 실패했을 때 **다음 주·다음 달까지 값이 비어 있게 된다.**
 * 매일 돌면 실패가 하루 안에 회복된다.
 *
 * 04시는 서비스 날짜 경계다(1.2) — 그 시각을 넘겨야 전날 재생이 전날 구간으로 확정된다.
 *
 * 드립 편성 배치(05:00)보다 **먼저** 돈다. 편성의 인기도 축이 이 값을 읽기 때문이다.
 */
@Injectable()
export class ContentStatAggregationScheduler {
  private readonly logger = new Logger(ContentStatAggregationScheduler.name);

  constructor(
    private readonly aggregationService: ContentStatAggregationService,
  ) {}

  @Cron('0 4 * * *', {
    name: 'content-stat-aggregation',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    try {
      await this.aggregationService.recomputeAll(new Date());
    } catch (error) {
      // 던지면 스케줄러가 멈춘다 — 다음 주기가 다시 시도한다(재집계라 안전하다)
      this.logger.error(
        'content stats aggregation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
