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

import { Topic } from './topic.entity';
import { UserInterestSource } from '../interest.enum';

/**
 * domain.md 4.2 — 사용자별 관심 주제.
 *
 * **행을 물리 삭제하지 않는다.** `uq_user_interests_user_id_topic_id` 때문에 재선택 시
 * 같은 행을 되살려야 하고, 자동 확장 제외 플래그(`is_user_removed`)가 지워지면 안 된다
 * (onboarding-api.md 4.3).
 */
@Entity('user_interests')
@Unique('uq_user_interests_user_id_topic_id', ['userId', 'topicId'])
@Index('idx_user_interests_user_id_is_active', ['userId', 'isActive'])
export class UserInterest extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_interests_users',
  })
  user: User;

  @Column({ name: 'topic_id', type: 'uuid' })
  topicId: string;

  @ManyToOne(() => Topic)
  @JoinColumn({
    name: 'topic_id',
    foreignKeyConstraintName: 'fk_user_interests_topics',
  })
  topic: Topic;

  @Column({ name: 'source', type: 'varchar', length: 20 })
  source: UserInterestSource;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * 사용자가 관심사 관리 화면에서 **직접 해제**했다는 뜻이며, 자동 확장(FR-18) 대상에서
   * 영구 제외한다. 온보딩의 선택 해제와 의미가 다르므로 온보딩은 이 값을 건드리지 않는다
   * (onboarding-api.md 4.3).
   */
  @Column({ name: 'is_user_removed', type: 'boolean', default: false })
  isUserRemoved: boolean;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;
}
