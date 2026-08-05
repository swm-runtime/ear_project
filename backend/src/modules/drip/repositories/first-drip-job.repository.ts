import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  FirstDripJobStatus,
  RETRYABLE_FIRST_DRIP_STATUSES,
} from '../drip.enum';
import { FirstDripJob } from '../entities/first-drip-job.entity';

@Injectable()
export class FirstDripJobRepository {
  constructor(
    @InjectRepository(FirstDripJob)
    private readonly repository: Repository<FirstDripJob>,
  ) {}

  private scoped(manager?: EntityManager): Repository<FirstDripJob> {
    return manager ? manager.getRepository(FirstDripJob) : this.repository;
  }

  async findByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<FirstDripJob | null> {
    return this.scoped(manager).findOneBy({ userId });
  }

  /**
   * 사용자당 1행을 보장하며 만든다. 이미 있으면 그 행을 그대로 쓴다 —
   * 완료 요청 재시도가 편성을 두 번 트리거하지 않게 하는 지점이다.
   */
  async createIfAbsent(
    userId: string,
    now: Date,
    manager?: EntityManager,
  ): Promise<FirstDripJob> {
    await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      .into(FirstDripJob)
      .values({
        userId,
        status: FirstDripJobStatus.PENDING,
        attemptCount: 0,
        itemCount: 0,
        lastAttemptedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .orIgnore()
      .execute();

    const job = await this.findByUserId(userId, manager);

    if (!job) {
      // orIgnore 직후에 행이 없다는 것은 삽입도 조회도 실패했다는 뜻이라 재시도 대상이다
      throw new Error('first drip job was not created');
    }

    return job;
  }

  async save(
    job: FirstDripJob,
    manager?: EntityManager,
  ): Promise<FirstDripJob> {
    return this.scoped(manager).save(job);
  }

  /**
   * 재시도 대상 작업을 **원자적으로 선점한다.**
   *
   * 서버가 여러 인스턴스로 뜨면 같은 작업을 동시에 집을 수 있으므로,
   * `FOR UPDATE SKIP LOCKED`로 한 인스턴스만 가져가게 한다. 선점과 동시에
   * `attempt_count`를 올려 두 번 세지 않는다.
   *
   * 복잡한 조건이라 Raw SQL을 쓴다 — **Repository 안에서만** 작성하고 결과를 타입으로
   * 정의해 반환한다(architecture.md 3.4).
   */
  async claimRetryable(
    now: Date,
    staleBefore: Date,
    maxAttemptCount: number,
    limit: number,
    manager?: EntityManager,
  ): Promise<string[]> {
    const result: unknown = await this.scoped(manager).query(
      `UPDATE first_drip_jobs
          SET status = $1,
              attempt_count = attempt_count + 1,
              last_attempted_at = $2,
              updated_at = $2
        WHERE id IN (
          SELECT id FROM first_drip_jobs
           WHERE status = ANY($3)
             AND attempt_count < $4
             AND (last_attempted_at IS NULL OR last_attempted_at < $5)
           ORDER BY last_attempted_at ASC NULLS FIRST
           LIMIT $6
           FOR UPDATE SKIP LOCKED
        )
        RETURNING user_id`,
      [
        FirstDripJobStatus.PENDING,
        now,
        [...RETRYABLE_FIRST_DRIP_STATUSES],
        maxAttemptCount,
        staleBefore,
        limit,
      ],
    );

    return toUserIds(result);
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}

/**
 * `UPDATE ... RETURNING`의 결과 모양을 흡수한다.
 *
 * TypeORM의 `query()`는 postgres 드라이버의 응답을 그대로 넘기는데, `UPDATE`는
 * **`[행 배열, 영향받은 행 수]`** 형태로 온다. 이것을 행 배열로 착각하면 갱신된 행이
 * 하나도 없어도 길이 2짜리 배열이 되어, 스케줄러가 매 주기마다 `undefined`를
 * 처리하려 든다(실행해 보고 발견한 문제다).
 */
function toUserIds(result: unknown): string[] {
  if (!Array.isArray(result)) {
    return [];
  }

  const rows: unknown[] = Array.isArray(result[0])
    ? (result[0] as unknown[])
    : result;

  return rows
    .map((row) =>
      row && typeof row === 'object' && 'user_id' in row
        ? String(row.user_id)
        : null,
    )
    .filter((userId): userId is string => userId !== null);
}
