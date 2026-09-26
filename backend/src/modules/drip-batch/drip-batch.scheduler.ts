import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';

/** `drip-scheduling.md` 2 — 일일 편성 배치는 **매일 05:00 KST 확정**(합의 2026-08-06)이다 */
const DAILY_DRIP_CRON = '0 0 5 * * *';
/**
 * 재실행 슬롯(2026-09-26) — 05:00 실행이 중간에 죽어 `finished_at`이 NULL로 남았으면 이어받는다.
 * `DRIP_BATCH_STALE_MS`(2시간)를 넘긴 미완료 실행만 다시 집으므로 05:00 + 2h 뒤인 07:30이다.
 * 정상 종료한 날은 선점이 거절돼 아무 일도 하지 않는다. 이미 받은 사용자는 `already_placed`로 건너뛴다.
 */
const DAILY_DRIP_RESUME_CRON = '0 30 7 * * *';
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

  @Cron(DAILY_DRIP_RESUME_CRON, {
    name: 'daily-drip-batch-resume',
    timeZone: DAILY_DRIP_TIMEZONE,
  })
  async resumeUnfinishedBatch(): Promise<void> {
    try {
      await this.dripBatchOrchestrator.run(new Date(), 'resume');
    } catch (error) {
      this.logger.error('daily drip batch resume failed', {
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
