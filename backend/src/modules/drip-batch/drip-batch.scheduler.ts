import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';

/** `drip-scheduling.md` 2 — 일일 편성 배치는 **매일 05:00 KST 확정**(합의 2026-08-06)이다 */
const DAILY_DRIP_CRON = '0 0 5 * * *';
const DAILY_DRIP_TIMEZONE = 'Asia/Seoul';

/**
 * 일일 편성 배치의 트리거. 서비스 날짜 경계(04시 — domain.md 1.2) 이후에 실행되도록
 * 05:00 KST로 고정한다. 다중 인스턴스 동시 기동은 Orchestrator의 `run_date` 선점이 막는다.
 */
@Injectable()
export class DripBatchScheduler {
  private readonly logger = new Logger(DripBatchScheduler.name);

  constructor(private readonly dripBatchOrchestrator: DripBatchOrchestrator) {}

  @Cron(DAILY_DRIP_CRON, {
    name: 'daily-drip-batch',
    timeZone: DAILY_DRIP_TIMEZONE,
  })
  async runDailyBatch(): Promise<void> {
    try {
      await this.dripBatchOrchestrator.run(new Date());
    } catch (error) {
      // 배치 전체 실패 — 사용자 단위 실패는 Orchestrator가 격리하므로 여기 오면 장애다
      this.logger.error('daily drip batch failed', {
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
