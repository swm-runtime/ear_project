import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/user/entities/user.entity';

import { FirstDripJobStatus } from '../drip.enum';

/**
 * domain.md 7.4 — 온보딩 첫 드립 편성 1건을 추적한다.
 *
 * `drip_batch_runs`로 대신할 수 없다: 그쪽은 `run_date` 유니크라 **하루 1행짜리 일일 배치
 * 기록**이고, 첫 드립은 가입 시점에 사용자별로 발생해 같은 날 여러 건이 생긴다.
 * `library_items` 유무만으로는 "아직 편성 중"과 "후보가 고갈돼 끝남"을 가를 수 없어,
 * 클라이언트가 영영 오지 않을 결과를 대기 상한 내내 기다리게 된다.
 *
 * **사용자당 1행이다.** 유니크가 완료 요청 재시도로 인한 중복 편성 트리거를 막는
 * 최종 방어선이다.
 */
@Entity('first_drip_jobs')
@Unique('uq_first_drip_jobs_user_id', ['userId'])
@Index('idx_first_drip_jobs_status_last_attempted_at', [
  'status',
  'lastAttemptedAt',
])
export class FirstDripJob extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /**
   * 1:1 관계지만 `@ManyToOne`으로 선언한다 — `@OneToOne`은 TypeORM이 이름 없는 유니크
   * 제약을 하나 더 만들어, 위에 명시한 `uq_first_drip_jobs_user_id`와 중복된다.
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_first_drip_jobs_users',
  })
  user: User;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: FirstDripJobStatus;

  /** **서버 내부** 재시도 횟수다. 클라이언트가 보내는 값이 아니며 화면에도 노출하지 않는다 */
  @Column({ name: 'attempt_count', type: 'smallint', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_attempted_at', type: 'timestamptz', nullable: true })
  lastAttemptedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** 실제로 적립된 편수. 적립은 원자적이라 "일부만 채워진 상태"가 없다 */
  @Column({ name: 'item_count', type: 'int', default: 0 })
  itemCount: number;
}
