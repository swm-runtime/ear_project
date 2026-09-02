import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';

import { UserSignalAction } from '../playback.enum';

/**
 * domain.md 6.4 — 추천 스코어링에 쓰는 **행동 이력**이다(FR-15).
 *
 * `playback_progresses` · `library_items`는 "현재 상태"만 알고 있어서 학습에 필요한 이력을
 * 표현할 수 없다. 특히 `skip`은 상태 테이블에서 "아직 듣는 중"과 구분되지 않고,
 * `unsave` · `delete`는 행이 사라져 근거가 남지 않는다.
 *
 * 최근성 가중(`drip-scheduling.md` 4.3)을 위해 `created_at`이 반드시 필요하다.
 * PK가 `bigserial`인 것은 대량 로그성 테이블이기 때문이다(convention.md 4.2 예외 조항).
 */
@Entity('user_signals')
@Index('idx_user_signals_user_id_created_at', ['userId', 'createdAt'])
export class UserSignal extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_signals_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content)
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_user_signals_contents',
  })
  content: Content;

  @Column({ name: 'action', type: 'varchar', length: 20 })
  action: UserSignalAction;

  /** 재생 관련 신호에만 담긴다. 담기·삭제 신호에는 위치라는 개념이 없다 */
  @Column({ name: 'position_sec', type: 'int', nullable: true })
  positionSec: number | null;

  @Column({ name: 'max_reached_sec', type: 'int', nullable: true })
  maxReachedSec: number | null;
}
