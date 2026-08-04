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
import { UserTier } from '@/modules/user/user.enum';

import { SubscriptionStatus, SubscriptionStore } from './subscription.enum';

/**
 * domain.md 8.2 — 티어의 진실의 원천. `users.tier`는 이 테이블을 반영한 캐시다.
 * **무료 사용자는 행이 없다.** 행이 하나라도 있으면 결제 이력이 있는 것으로 본다(12.3).
 */
@Entity('subscriptions')
@Unique('uq_subscriptions_original_transaction_id', ['originalTransactionId'])
@Index('idx_subscriptions_user_id_status', ['userId', 'status'])
export class Subscription extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_subscriptions_users',
  })
  user: User;

  @Column({ name: 'tier', type: 'varchar', length: 20 })
  tier: UserTier;

  @Column({ name: 'store', type: 'varchar', length: 20 })
  store: SubscriptionStore;

  @Column({ name: 'original_transaction_id', type: 'varchar', length: 255 })
  originalTransactionId: string;

  @Column({ name: 'latest_receipt', type: 'text' })
  latestReceipt: string;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: SubscriptionStatus;

  @Column({ name: 'is_auto_renew', type: 'boolean' })
  isAutoRenew: boolean;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;
}
