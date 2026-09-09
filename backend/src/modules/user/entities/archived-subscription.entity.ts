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
/**
 * **계정마다 한 줄이다**(개정 2026-09-09). 종전에는 `originalTransactionId` 단독 유니크라,
 * 탈퇴 → 재가입(복원) → 재탈퇴 시 같은 값을 두 번 넣게 되어 **탈퇴 자체가 500으로 막혔다.**
 *
 * "한 구독 = 한 계정"은 `uq_subscriptions_original_transaction_id`가 집행한다(domain.md 8.2).
 * 아카이브는 권한이 아니라 **보존 기록**이고, 보존 의무는 계정별 거래에 성립한다.
 */
@Unique('uq_archived_subscriptions_user_hash_original_transaction_id', [
  'userHash',
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
