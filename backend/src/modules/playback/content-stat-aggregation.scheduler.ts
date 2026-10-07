import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { serviceDayStartHour } from '@/common/utils/service-date.util';

import { ContentStatAggregationService } from './services/content-stat-aggregation.service';

/**
 * `content_stats` 집계 배치의 실행 시각(domain.md 5.4 — B-6).
 *
 * 문서는 `week` 매주 월요일 · `month` 매달 1일로 나눠 적었으나, **매일 한 번 돌린다.** 재집계 upsert라
 * 몇 번 돌아도 결과가 같고, 주·월 배치를 따로 두면 그 하루에만 도는 잡이 실패했을 때 **다음 주·다음
 * 달까지 값이 비어 있게 된다.** 매일 돌면 실패가 하루 안에 회복된다.
 *
 * 실행 시각은 **서비스 날짜 경계를 넘긴 뒤**여야 한다(1.2) — 그래야 전날 재생이 전날 구간으로 확정된다.
 * 경계가 04:00 → 05:00 으로 옮겨지는 중이라(KAN-149, env `SERVICE_DAY_BOUNDARY_05_FROM`) 등록을 둘 둔다:
 *
 * - `content-stat-aggregation` 04:00 — 경계가 아직 04:00 일 때만 돈다. 드립 편성(05:00)보다 먼저 돌아
 *   편성의 인기도 축이 전날 값을 읽는다(종전 동작 그대로)
 * - `content-stat-aggregation-0530` 05:30 — 경계가 05:00 으로 바뀐 뒤에만 돈다. 05:00 에 돌면 경계
 *   정각이라 전날 마지막 재생이 아직 안 들어와 있을 수 있고 드립 편성과 DB 부하가 겹친다. 드립은
 *   누적값(`findAllTimeCounts`)만 읽어 하루 늦은 집계여도 영향이 미미하다(PM 확정 2026-10-07)
 *
 * 둘 다 등록돼 있지만 그 시각의 경계를 보고 한쪽만 실행한다 — 전환일 배포 없이 env 만으로 옮겨 가게.
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
    await this.runIfBoundaryHour(4);
  }

  @Cron('30 5 * * *', {
    name: 'content-stat-aggregation-0530',
    timeZone: 'Asia/Seoul',
  })
  async runAfterBoundaryMove(): Promise<void> {
    await this.runIfBoundaryHour(5);
  }

  /** 지금 시각에 적용되는 경계가 `hour`일 때만 재집계한다. 아니면 다른 쪽 등록이 맡는다 */
  private async runIfBoundaryHour(hour: number): Promise<void> {
    const now = new Date();
    if (serviceDayStartHour(now) !== hour) {
      this.logger.debug(
        `content stats aggregation skipped — boundary is ${serviceDayStartHour(now)}:00, this slot is for ${hour}:00`,
      );
      return;
    }

    try {
      await this.aggregationService.recomputeAll(now);
    } catch (error) {
      // 던지면 스케줄러가 멈춘다 — 다음 주기가 다시 시도한다(재집계라 안전하다)
      this.logger.error(
        'content stats aggregation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
