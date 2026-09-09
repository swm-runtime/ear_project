import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  FIRST_DRIP_JOB_RETENTION_MS,
  FIRST_DRIP_PURGE_INTERVAL_MS,
} from './drip.constant';
import { FirstDripJobRepository } from './repositories/first-drip-job.repository';

/**
 * 끝난 첫 드립 작업을 지운다 — `domain.md` 7.4 / 12.1 "`completed_at` 기준 30일 후 배치 삭제"의
 * 실행부다. 이 배치가 없던 동안 `first_drip_jobs`는 가입자 수만큼 영구 누적됐다(2026-09-09 감사).
 *
 * 온보딩 1회성 작업 기록이라 목적이 끝난 뒤의 보존 근거가 없고, 운영 지표(0건 담기 비율·
 * 편성 실패율)는 완료 시점의 구조화 로그로 이미 빠져나갔다. 미완료(`completed_at IS NULL`)
 * 행은 대상이 아니다 — 재시도 큐(`first-drip-retry.scheduler.ts`)가 아직 볼 수 있다.
 *
 * 다중 인스턴스가 동시에 돌아도 안전하다. 같은 조건의 DELETE라 겹치면 지울 것이 없을 뿐이다.
 */
@Injectable()
export class FirstDripPurgeScheduler {
  private readonly logger = new Logger(FirstDripPurgeScheduler.name);

  constructor(
    private readonly firstDripJobRepository: FirstDripJobRepository,
  ) {}

  @Interval('first-drip-purge', FIRST_DRIP_PURGE_INTERVAL_MS)
  async purgeCompleted(): Promise<void> {
    const before = new Date(Date.now() - FIRST_DRIP_JOB_RETENTION_MS);

    try {
      const deletedCount =
        await this.firstDripJobRepository.deleteCompletedBefore(before);

      if (deletedCount > 0) {
        this.logger.log('completed first drip jobs purged', {
          deleted_count: deletedCount,
        });
      }
    } catch (error) {
      // 실패해도 다음 주기가 다시 시도한다 — 던지면 스케줄러가 멈춘다
      this.logger.error(
        'failed to purge completed first drip jobs',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
