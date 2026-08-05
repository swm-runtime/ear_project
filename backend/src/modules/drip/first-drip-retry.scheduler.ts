import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  FIRST_DRIP_MAX_TOTAL_ATTEMPT_COUNT,
  FIRST_DRIP_RETRY_BATCH_SIZE,
  FIRST_DRIP_RETRY_INTERVAL_MS,
  FIRST_DRIP_RETRY_STALE_MS,
} from './drip.constant';
import { FirstDripJobRepository } from './repositories/first-drip-job.repository';
import { FirstDripService } from './services/first-drip.service';

/**
 * onboarding.md 4 [완료]가 말하는 **"서버의 비동기 재시도 큐"** 다.
 *
 * 클라이언트는 대기 상한(15초)을 넘기면 폴링을 멈추고 완료 화면으로 진행하는데,
 * 그 시점에 요청은 끝나 있고 라이브러리는 비어 있다. **요청 바깥에서 도는 것이 없으면
 * 그 사용자의 첫 드립을 다시 시도할 주체가 사라진다.**
 *
 * 별도 큐 인프라(Redis·BullMQ)를 두지 않고 `first_drip_jobs`를 작업 테이블로 쓴다
 * (architecture.md 미결 사항의 "DB 기반 작업 테이블 + 스케줄러" 선택지).
 * `idx_first_drip_jobs_status_last_attempted_at`이 이 조회를 위한 인덱스다.
 *
 * 다중 인스턴스 동시 실행은 선점 쿼리의 `FOR UPDATE SKIP LOCKED`가 막는다.
 */
@Injectable()
export class FirstDripRetryScheduler {
  private readonly logger = new Logger(FirstDripRetryScheduler.name);

  constructor(
    private readonly firstDripJobRepository: FirstDripJobRepository,
    private readonly firstDripService: FirstDripService,
  ) {}

  @Interval('first-drip-retry', FIRST_DRIP_RETRY_INTERVAL_MS)
  async retryStalledJobs(): Promise<void> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - FIRST_DRIP_RETRY_STALE_MS);

    let userIds: string[];

    try {
      userIds = await this.firstDripJobRepository.claimRetryable(
        now,
        staleBefore,
        FIRST_DRIP_MAX_TOTAL_ATTEMPT_COUNT,
        FIRST_DRIP_RETRY_BATCH_SIZE,
      );
    } catch (error) {
      this.logger.error('failed to claim first drip jobs', {
        error: error instanceof Error ? error.message : 'unknown error',
      });
      return;
    }

    if (userIds.length === 0) {
      return;
    }

    // 건당 로그를 남기지 않고 집계해서 한 번 남긴다 (convention.md 8.5)
    this.logger.log('retrying first drip jobs', {
      claimedCount: userIds.length,
    });

    for (const userId of userIds) {
      await this.firstDripService.runClaimed(userId, now);
    }
  }
}
