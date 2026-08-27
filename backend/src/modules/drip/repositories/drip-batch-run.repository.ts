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
  async claim(
    runDate: string,
    startedAt: Date,
    manager?: EntityManager,
  ): Promise<DripBatchRun | null> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .values({ runDate, startedAt })
      .orIgnore()
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
