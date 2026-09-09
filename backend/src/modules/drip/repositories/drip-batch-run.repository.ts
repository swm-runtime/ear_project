import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { DripBatchRun } from '../entities/drip-batch-run.entity';

@Injectable()
export class DripBatchRunRepository {
  constructor(
    @InjectRepository(DripBatchRun)
    private readonly repository: Repository<DripBatchRun>,
  ) {}

  private scoped(manager?: EntityManager): Repository<DripBatchRun> {
    return manager ? manager.getRepository(DripBatchRun) : this.repository;
  }

  /**
   * 실행 선점 — `uq_drip_batch_runs_run_date`로 하루 한 번만 성립한다(domain.md 7.3).
   *
   * @returns 이 호출이 행을 만들었으면 그 행, 이미 있으면(다른 인스턴스가 선점) `null`
   */
  /**
   * 그날의 실행권을 집는다. `uq_drip_batch_runs_run_date`가 동시 실행을 막는다.
   *
   * **끝나지 않은 채 오래된 행은 다시 집는다**(`staleBefore`). 그러지 않으면 배치가 중간에
   * 죽은 날은 `finished_at`이 NULL로 남아 재실행이 영구히 막히고, 복구 수단이 수동
   * `DELETE`밖에 없다. 이미 끝난 행(`finished_at IS NOT NULL`)은 다시 집지 않는다.
   */
  async claim(
    runDate: string,
    startedAt: Date,
    staleBefore: Date,
    manager?: EntityManager,
  ): Promise<DripBatchRun | null> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .values({ runDate, startedAt })
      .orUpdate(['started_at'], ['run_date'], {
        // 끝났거나, 아직 돌고 있을 수 있을 만큼 최근이면 건드리지 않는다
        overwriteCondition: {
          // TypeORM이 대상 테이블에 엔티티명 alias를 붙인다 — 테이블명으로 참조하면
          // `invalid reference to FROM-clause entry`로 매 실행이 죽는다(로컬 실측)
          where:
            '"DripBatchRun"."finished_at" IS NULL AND "DripBatchRun"."started_at" < :staleBefore',
          parameters: { staleBefore },
        },
      })
      .returning('id')
      .execute();

    if ((result.raw as unknown[]).length === 0) {
      return null;
    }

    return this.scoped(manager).findOneBy({ runDate });
  }

  async save(
    run: DripBatchRun,
    manager?: EntityManager,
  ): Promise<DripBatchRun> {
    return this.scoped(manager).save(run);
  }
}
