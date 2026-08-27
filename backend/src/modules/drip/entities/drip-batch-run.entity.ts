import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

/**
 * domain.md 7.3 — 일일 편성 배치의 실행 기록.
 *
 * **`uq_drip_batch_runs_run_date`가 배치 중복 실행을 막는다**(A-5). 같은 서비스 날짜에
 * 두 인스턴스가 동시에 시작해도 행을 넣은 쪽만 실행한다. 사용자 단위 중복은
 * `library_items (user_id, content_id)` 유니크가 막는다.
 *
 * 운영 콘솔 조회용으로 DB에 유지한다(B-8). `finished_at`이 NULL이면 실행 중이다.
 */
@Entity('drip_batch_runs')
@Unique('uq_drip_batch_runs_run_date', ['runDate'])
export class DripBatchRun extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 서비스 날짜(04시 경계 — domain.md 1.2) */
  @Column({ name: 'run_date', type: 'date' })
  runDate: string;

  @Column({ name: 'target_count', type: 'int', default: 0 })
  targetCount: number;

  @Column({ name: 'success_count', type: 'int', default: 0 })
  successCount: number;

  @Column({ name: 'skipped_count', type: 'int', default: 0 })
  skippedCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
