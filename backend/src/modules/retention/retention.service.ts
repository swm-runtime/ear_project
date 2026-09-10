import { Injectable } from '@nestjs/common';

import {
  RETENTION_PURGE_BATCH_SIZE,
  RETENTION_PURGE_MAX_BATCHES,
  RetentionPolicy,
  toRetentionCutoff,
} from './retention.constant';
import { RetentionRepository } from './retention.repository';

export interface RetentionPurgeOutcome {
  /** 이번 실행에서 지운 총 행 수 */
  deletedCount: number;
  /** 이 시각보다 오래된 행이 대상이었다 */
  cutoff: Date;
  /** 배치 상한에 걸려 **아직 지울 것이 남았다**. 다음 실행이 이어서 지운다 */
  hasRemaining: boolean;
}

/**
 * `domain.md` 12.1이 정한 보존 기간을 집행한다 — 기간을 문서에 적어 두는 것만으로는
 * 아무것도 지워지지 않으므로, **이 서비스가 그 기간의 유일한 집행 경로다.**
 *
 * 다중 인스턴스가 동시에 돌아도 안전하다. 같은 조건의 `DELETE`라 겹치면 지울 것이 없을 뿐이다.
 */
@Injectable()
export class RetentionService {
  constructor(private readonly retentionRepository: RetentionRepository) {}

  /**
   * 한 테이블의 만료 행을 **배치가 다 빌 때까지** 반복해서 지운다.
   *
   * 지운 수가 배치 크기보다 적으면 더 지울 것이 없다는 뜻이다 — 그때 멈춘다.
   * 정확히 배치 크기만큼 지웠다면 남아 있을 수 있으므로 한 번 더 돈다.
   */
  async purgeExpired(
    policy: RetentionPolicy,
    now: Date,
  ): Promise<RetentionPurgeOutcome> {
    const cutoff = toRetentionCutoff(policy.retentionDays, now);
    let deletedCount = 0;

    for (let batch = 0; batch < RETENTION_PURGE_MAX_BATCHES; batch += 1) {
      const deleted = await this.retentionRepository.deleteCreatedBefore(
        policy.table,
        cutoff,
        RETENTION_PURGE_BATCH_SIZE,
      );
      deletedCount += deleted;

      if (deleted < RETENTION_PURGE_BATCH_SIZE) {
        return { deletedCount, cutoff, hasRemaining: false };
      }
    }

    return { deletedCount, cutoff, hasRemaining: true };
  }
}
