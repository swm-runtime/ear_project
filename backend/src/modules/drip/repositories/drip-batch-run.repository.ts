import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { DripGroup } from '../drip.enum';
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
   * 그날·그 그룹의 실행권을 집는다. `uq_drip_batch_runs_run_date_group`이 동시 실행을 막는다.
   *
   * **끝나지 않은 채 오래된 행은 다시 집는다**(`staleBefore`). 그러지 않으면 배치가 중간에
   * 죽은 날은 `finished_at`이 NULL로 남아 재실행이 영구히 막히고, 복구 수단이 수동
   * `DELETE`밖에 없다. 이미 끝난 행(`finished_at IS NOT NULL`)은 다시 집지 않는다.
   *
   * @returns 이 호출이 행을 만들었거나 다시 집었으면 그 행, 아니면(다른 인스턴스가 선점·이미 끝남) `null`
   */
  async claim(
    runDate: string,
    group: DripGroup,
    startedAt: Date,
    staleBefore: Date,
    manager?: EntityManager,
  ): Promise<DripBatchRun | null> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      // `created_at`을 선점 시각으로 박는다 — 도착 알림이 이 값부터 적립분을 읽는데(`notifyTodayArrivals`), 적립의
      // `added_at`은 배치가 받은 `startedAt`이다. DB `now()`에 맡기면 몇 ms 늦어 첫 패스 적립분이 전부 범위 밖이 된다.
      // 오래된 행을 다시 집을 때(아래 upsert)는 `started_at`만 바뀌어 처음 값이 남는다
      .values({ runDate, group, startedAt, createdAt: startedAt })
      .orUpdate(['started_at'], ['run_date', 'group'], {
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

    return this.scoped(manager).findOneBy({ runDate, group });
  }

  /**
   * **미완료 행만** 다시 집는다 — 프로세스 재시작 직후의 재개 경로(`DripBatchRunService.claim` `reclaimUnfinished`).
   * `claim`과 달리 행을 **만들지 않는다**: INSERT 경로를 그대로 쓰면 그날 행이 없을 때(경계 뒤·05:00 크론 전 재시작)
   * 새 실행이 성립해 전 사용자 편성·푸시가 예정보다 먼저 나갔다(2026-10-09 전체 검증). 정상 종료한 날이나 아직 시작하지
   * 않은 날은 `null` — 호출부는 아무것도 하지 않는다.
   */
  async reclaimUnfinished(
    runDate: string,
    group: DripGroup,
    startedAt: Date,
    manager?: EntityManager,
  ): Promise<DripBatchRun | null> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .update()
      .set({ startedAt })
      .where(
        'run_date = :runDate AND "group" = :group AND finished_at IS NULL',
        { runDate, group },
      )
      .returning('id')
      .execute();

    if ((result.raw as unknown[]).length === 0) {
      return null;
    }

    return this.scoped(manager).findOneBy({ runDate, group });
  }

  async findByRunDateAndGroup(
    runDate: string,
    group: DripGroup,
    manager?: EntityManager,
  ): Promise<DripBatchRun | null> {
    return this.scoped(manager).findOneBy({ runDate, group });
  }

  async save(
    run: DripBatchRun,
    manager?: EntityManager,
  ): Promise<DripBatchRun> {
    return this.scoped(manager).save(run);
  }
}
