import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { isSchedulerProcess } from '@/common/cluster.util';

import { AppRemoveAlertService } from './app-remove-alert.service';
import { APP_REMOVE_POLL_INTERVAL_MS } from './voc.constant';

/**
 * 앱 삭제 알림 트리거 — 5분 간격(`features/backend-monitoring.md` 3-4).
 *
 * 스토어 리뷰 폴링과 같은 규칙: 스케줄러 프로세스에서만, 구성이 없으면 조용히 건너뛰고, 실패해도 던지지 않는다
 * — 던지면 다음 주기가 없다. 실패한 주기의 분은 "마지막으로 집계한 분"이 그대로라 다음 주기가 다시 본다
 * (실시간 창 30분 안이면).
 */
@Injectable()
export class AppRemoveAlertScheduler {
  private readonly logger = new Logger(AppRemoveAlertScheduler.name);

  constructor(private readonly appRemoveAlertService: AppRemoveAlertService) {}

  @Interval('app-remove-poll', APP_REMOVE_POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (!isSchedulerProcess() || !this.appRemoveAlertService.configured) {
      return;
    }

    try {
      await this.appRemoveAlertService.poll(new Date());
    } catch (error) {
      this.logger.error(
        'app remove poll failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
