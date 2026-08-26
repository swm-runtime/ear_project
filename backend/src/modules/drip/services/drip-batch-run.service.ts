import { Injectable } from '@nestjs/common';

import { DripBatchRun } from '../entities/drip-batch-run.entity';
import { DripBatchRunRepository } from '../repositories/drip-batch-run.repository';

/** 배치 실행 결과 집계 — domain.md 7.3의 카운트 컬럼과 1:1이다 */
export interface DripBatchCounts {
  targetCount: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
}

/**
 * `drip_batch_runs`(domain.md 7.3)의 소유 Service — 배치 중복 실행 방지와 운영 기록.
 * 편성 배치 Orchestrator가 시작 시 `claim`, 종료 시 `finish`를 호출한다.
 */
@Injectable()
export class DripBatchRunService {
  constructor(
    private readonly dripBatchRunRepository: DripBatchRunRepository,
  ) {}

  /**
   * 같은 서비스 날짜의 실행을 선점한다. `null`이면 이미 실행됐거나 실행 중이다 —
   * 호출부는 배치를 시작하지 않는다(`drip-scheduling.md` 4.6-5 멱등 규칙).
   */
  async claim(runDate: string, startedAt: Date): Promise<DripBatchRun | null> {
    return this.dripBatchRunRepository.claim(runDate, startedAt);
  }

  async finish(
    run: DripBatchRun,
    counts: DripBatchCounts,
    finishedAt: Date,
  ): Promise<void> {
    run.targetCount = counts.targetCount;
    run.successCount = counts.successCount;
    run.skippedCount = counts.skippedCount;
    run.failedCount = counts.failedCount;
    run.finishedAt = finishedAt;

    await this.dripBatchRunRepository.save(run);
  }
}
