import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { isSchedulerProcess } from '@/common/cluster.util';

import { StoreReviewPollService } from './store-review-poll.service';
import { STORE_REVIEW_POLL_INTERVAL_MS } from './voc.constant';

/**
 * 스토어 리뷰 폴링 트리거 — 15분 간격(KAN-133).
 *
 * `ScheduleModule`은 스케줄러 프로세스에만 올라가므로(`app.module.ts`) 클러스터에서 한 번만 돈다. 그래도
 * `isSchedulerProcess()`를 한 번 더 본다 — 모듈 조립이 바뀌어도 리뷰 알림이 워커 수만큼 중복되지 않게.
 * 구성이 없으면(자격증명·웹훅) 조용히 건너뛴다 — 로컬·테스트 기본. 실패해도 던지지 않는다: 던지면 다음 주기가 없다.
 */
@Injectable()
export class StoreReviewPollScheduler {
  private readonly logger = new Logger(StoreReviewPollScheduler.name);

  constructor(
    private readonly storeReviewPollService: StoreReviewPollService,
  ) {}

  @Interval('store-review-poll', STORE_REVIEW_POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (!isSchedulerProcess() || !this.storeReviewPollService.configured) {
      return;
    }

    try {
      await this.storeReviewPollService.poll(new Date());
    } catch (error) {
      // 한 주기의 실패 — 다음 주기가 다시 조회한다(수정 시각 기준이라 놓친 리뷰도 그때 잡힌다)
      this.logger.error(
        'store review poll failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
