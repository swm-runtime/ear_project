import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { DRIP_GROUP_SCHEDULES } from '@/modules/drip/drip-group.policy';
import { DripGroup } from '@/modules/drip/drip.enum';

import { RETENTION_PUSH_LOCAL_HOUR } from './retention-push.constant';
import { RetentionPushService } from './retention-push.service';

const RETENTION_PUSH_CRON = `0 0 ${RETENTION_PUSH_LOCAL_HOUR} * * *`;

/**
 * 저녁 리텐션 알림 트리거 — 그룹 기준 시간대의 **현지 18:00**(`notification.md` 4.6). 드립 크론과 같은 그룹 정의를 쓴다.
 * 크론은 늘 등록되고, `RETENTION_PUSH_MODE`가 `off`(기본)이거나 꺼진 그룹이면 아무것도 하지 않는다.
 */
@Injectable()
export class RetentionPushScheduler {
  private readonly logger = new Logger(RetentionPushScheduler.name);

  constructor(private readonly retentionPushService: RetentionPushService) {}

  @Cron(RETENTION_PUSH_CRON, {
    name: 'retention-push',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.ASIA].timeZone,
  })
  async runAsia(): Promise<void> {
    await this.runGroup(DripGroup.ASIA);
  }

  @Cron(RETENTION_PUSH_CRON, {
    name: 'retention-push-europe',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.EUROPE].timeZone,
  })
  async runEurope(): Promise<void> {
    await this.runGroup(DripGroup.EUROPE);
  }

  @Cron(RETENTION_PUSH_CRON, {
    name: 'retention-push-americas',
    timeZone: DRIP_GROUP_SCHEDULES[DripGroup.AMERICAS].timeZone,
  })
  async runAmericas(): Promise<void> {
    await this.runGroup(DripGroup.AMERICAS);
  }

  private async runGroup(group: DripGroup): Promise<void> {
    if (!this.retentionPushService.isGroupActive(group)) {
      return;
    }

    try {
      await this.retentionPushService.run(group, new Date());
    } catch (error) {
      this.logger.error('retention push failed', {
        group,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
}
