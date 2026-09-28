import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { isSchedulerProcess } from '@/common/cluster.util';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';

/** `drip-scheduling.md` 2 — 일일 편성 배치는 **매일 05:00 KST 확정**(합의 2026-08-06)이다 */
const DAILY_DRIP_CRON = '0 0 5 * * *';
const DAILY_DRIP_TIMEZONE = 'Asia/Seoul';

/**
 * 일일 편성 배치의 트리거. 서비스 날짜 경계(04시 — domain.md 1.2) 이후에 실행되도록
 * 05:00 KST로 고정한다. 다중 인스턴스 동시 기동은 Orchestrator의 `run_date` 선점이 막는다.
 */
@Injectable()
export class DripBatchScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(DripBatchScheduler.name);

  constructor(private readonly dripBatchOrchestrator: DripBatchOrchestrator) {}

  /**
   * **재시작 시 재개**(2026-09-26) — 05:00 배치가 도는 중에 배포·크래시로 프로세스가 죽으면 배치 안의
   * 어떤 코드도 이어서 돌 수 없다. 배치를 돌리는 프로세스는 스케줄러 워커 하나뿐이므로, 그 프로세스가
   * 다시 뜬 시점에 오늘 날짜의 미완료 실행이 있으면 그것이 곧 죽은 실행이다 — 여기서 이어받는다.
   * 정상 배포에서는 미완료 행이 없어 선점이 거절되고 로그 한 줄로 끝난다. 시각 기반 슬롯을 두지 않는
   * 이유: 재시작이 없었다면 재개할 것도 없고, 있었다면 그 순간이 재개 시점이다.
   * 부팅을 막지 않도록 기다리지 않는다(`void`) — 실패는 로그로만 남긴다.
   */
  onApplicationBootstrap(): void {
    if (!isSchedulerProcess()) {
      return;
    }

    void this.resumeUnfinishedBatch();
  }

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
