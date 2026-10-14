import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { DripGroup } from '../drip.enum';

/**
 * domain.md 7.3 — 일일 편성 배치의 실행 기록.
 *
 * **`uq_drip_batch_runs_run_date_group`이 배치 중복 실행을 막는다**(A-5). 같은 서비스 날짜·같은 발송 그룹에
 * 두 인스턴스가 동시에 시작해도 행을 넣은 쪽만 실행한다(그룹 축 2026-10-14 — KAN-191). 사용자 단위 중복은
 * `library_items (user_id, content_id)` 유니크가 막는다.
 *
 * 운영 콘솔 조회용으로 DB에 유지한다(B-8). `finished_at`이 NULL이면 실행 중이다.
 */
@Entity('drip_batch_runs')
@Unique('uq_drip_batch_runs_run_date_group', ['runDate', 'group'])
export class DripBatchRun extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 서비스 날짜(05시 경계 — domain.md 1.2) */
  @Column({ name: 'run_date', type: 'date' })
  runDate: string;

  /** 발송 그룹(`global-api.md` 2.4). 시간대 그룹이 꺼져 있으면 언제나 기본 그룹 `asia`다 */
  @Column({
    name: 'group',
    type: 'varchar',
    length: 16,
    default: DripGroup.ASIA,
  })
  group: DripGroup;

  @Column({ name: 'target_count', type: 'int', default: 0 })
  targetCount: number;

  @Column({ name: 'success_count', type: 'int', default: 0 })
  successCount: number;

  @Column({ name: 'skipped_count', type: 'int', default: 0 })
  skippedCount: number;

  /** 편성 대상이었으나 후보 고갈로 0편 — 콘텐츠 수급 신호 (domain.md 7.3, 2026-09-11) */
  @Column({ name: 'exhausted_count', type: 'int', default: 0 })
  exhaustedCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
