import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { isSchedulerProcess } from '@/common/cluster.util';
import {
  DRIP_ARRIVAL_PUSH_LOCAL_HOUR,
  DRIP_BATCH_LOCAL_HOUR,
  DRIP_GROUP_SCHEDULES,
} from '@/modules/drip/drip-group.policy';
import { DripGroup } from '@/modules/drip/drip.enum';

import { DripBatchOrchestrator } from './drip-batch.orchestrator';

/** `drip-scheduling.md` 2 — 일일 편성 배치는 **매일 현지 05:00**이다(KR = 05:00 KST, 합의 2026-08-06) */
const DAILY_DRIP_CRON = `0 0 ${DRIP_BATCH_LOCAL_HOUR} * * *`;
/** 드립 도착 알림 — **현지 07:00**(2026-10-14). 편성(05:00)과 떼어 낸다 — 새벽 5시 알림은 잠금화면에 묻혔다 */
const DRIP_ARRIVAL_PUSH_CRON = `0 0 ${DRIP_ARRIVAL_PUSH_LOCAL_HOUR} * * *`;

/**
 * 일일 편성 배치의 트리거. 서비스 날짜 경계(05:00 — domain.md 1.2)와 같은 시각(경계 정각이라 새 서비스 날짜로 편성된다. 2026-10-12 전환 전에는 경계 04:00 이후)에 실행되도록
 * 05:00 KST로 고정한다. 다중 인스턴스 동시 기동은 Orchestrator의 `(run_date, group)` 선점이 막는다.
 *
 * **발송 그룹**(`global-api.md` 2.4, KAN-191) — 그룹마다 기준 시간대(`DRIP_GROUP_SCHEDULES`)의 현지 시각으로 크론을
 * 둔다. 크론은 항상 등록되고, 시간대 그룹 스위치가 꺼져 있으면 기본 그룹(`asia`) 밖의 크론은 아무것도 하지 않는다.
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
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.ASIA].timeZone,
  })
  async runDailyBatch(): Promise<void> {
    await this.runGroupBatch(DripGroup.ASIA);
  }

  @Cron(DAILY_DRIP_CRON, {
    name: 'daily-drip-batch-europe',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.EUROPE].timeZone,
  })
  async runEuropeBatch(): Promise<void> {
    await this.runGroupBatch(DripGroup.EUROPE);
  }

  @Cron(DAILY_DRIP_CRON, {
    name: 'daily-drip-batch-americas',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.AMERICAS].timeZone,
  })
  async runAmericasBatch(): Promise<void> {
    await this.runGroupBatch(DripGroup.AMERICAS);
  }

  @Cron(DRIP_ARRIVAL_PUSH_CRON, {
    name: 'drip-arrival-push',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.ASIA].timeZone,
  })
  async pushDripArrivals(): Promise<void> {
    await this.pushGroupArrivals(DripGroup.ASIA);
  }

  @Cron(DRIP_ARRIVAL_PUSH_CRON, {
    name: 'drip-arrival-push-europe',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.EUROPE].timeZone,
  })
  async pushEuropeArrivals(): Promise<void> {
    await this.pushGroupArrivals(DripGroup.EUROPE);
  }

  @Cron(DRIP_ARRIVAL_PUSH_CRON, {
    name: 'drip-arrival-push-americas',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.AMERICAS].timeZone,
  })
  async pushAmericasArrivals(): Promise<void> {
    await this.pushGroupArrivals(DripGroup.AMERICAS);
  }

  /** 켜진 그룹마다 오늘 미완료 실행을 이어받는다 — 한 그룹의 실패가 다른 그룹의 재개를 막지 않는다 */
  async resumeUnfinishedBatch(): Promise<void> {
    for (const group of Object.values(DripGroup)) {
      if (!this.dripBatchOrchestrator.isGroupActive(group)) {
        continue;
      }

      try {
        await this.dripBatchOrchestrator.run(new Date(), 'resume', group);
      } catch (error) {
        this.logger.error('daily drip batch resume failed', {
          group,
          error: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }
  }

  private async runGroupBatch(group: DripGroup): Promise<void> {
    if (!this.dripBatchOrchestrator.isGroupActive(group)) {
      return;
    }

    try {
      await this.dripBatchOrchestrator.run(new Date(), 'scheduled', group);
    } catch (error) {
      // 배치 전체 실패 — 사용자 단위 실패는 Orchestrator가 격리하므로 여기 오면 장애다
      this.logger.error('daily drip batch failed', {
        group,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  private async pushGroupArrivals(group: DripGroup): Promise<void> {
    if (!this.dripBatchOrchestrator.isGroupActive(group)) {
      return;
    }

    try {
      await this.dripBatchOrchestrator.notifyTodayArrivals(new Date(), group);
    } catch (error) {
      // 알림 실패는 편성에 영향이 없다 — 적립은 05:00에 이미 끝났다
      this.logger.error('drip arrival push failed', {
        group,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
