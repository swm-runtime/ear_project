import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import {
  SubscriptionStatus,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';

import { UserTier } from '../user.enum';

/**
 * domain.md 11.5 — 구독 이력 보존(5년).
 * `latest_receipt`은 이관하지 않는다 — 개인정보가 포함될 수 있고,
 * 재검증이 필요하면 `original_transaction_id`로 스토어 API를 호출하면 된다.
 */
@Entity({ schema: 'archive', name: 'archived_subscriptions' })
@Unique('uq_archived_subscriptions_original_transaction_id', [
  'originalTransactionId',
])
@Index('idx_archived_subscriptions_user_hash', ['userHash'])
@Index('idx_archived_subscriptions_archived_at', ['archivedAt'])
export class ArchivedSubscription extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_hash', type: 'varchar', length: 128 })
  userHash: string;

  @Column({ name: 'user_hash_version', type: 'smallint', default: 1 })
  userHashVersion: number;

  /** 재가입 시 구독 복원 판정 근거 */
  @Column({ name: 'original_transaction_id', type: 'varchar', length: 255 })
  originalTransactionId: string;

  @Column({ name: 'store', type: 'varchar', length: 20 })
  store: SubscriptionStore;

  @Column({ name: 'tier', type: 'varchar', length: 20 })
  tier: UserTier;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: SubscriptionStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz' })
  archivedAt: Date;
}
