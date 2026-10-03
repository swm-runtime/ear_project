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

import {
  SubscriptionEnvironment,
  SubscriptionStatus,
  SubscriptionStore,
} from '../subscription.enum';

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

  /**
   * 스토어 구독의 자연 키. App Store는 `originalTransactionId`(숫자열), **Play는 그 구독의 최초 구매 토큰**이다
   * (`subscription-api.md` 4.7). Play 토큰은 App Store ID보다 훨씬 길어 길이를 넉넉히 둔다 — 넘치면 결제는
   * 됐는데 저장이 실패한다.
   */
  @Column({ name: 'original_transaction_id', type: 'varchar', length: 2048 })
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

  /**
   * 다운그레이드 예약 — 다음 갱신 때 바뀔 티어. 스토어는 다운그레이드를 "현재 주기가 끝나면"으로
   * 예약하므로 그동안 `tier`는 그대로다. 갱신·업그레이드·예약 취소 때 비운다.
   */
  @Column({ name: 'pending_tier', type: 'varchar', length: 20, nullable: true })
  pendingTier: UserTier | null;

  @Column({
    name: 'environment',
    type: 'varchar',
    length: 20,
    default: SubscriptionEnvironment.PRODUCTION,
  })
  environment: SubscriptionEnvironment;

  /**
   * 마지막으로 반영한 스토어 서버 알림의 서명 시각. 알림은 순서가 뒤바뀌어 올 수 있다 —
   * 이보다 과거에 서명된 알림은 상태를 덮지 않는다(`subscription-api.md` 4.6).
   */
  @Column({ name: 'last_notified_at', type: 'timestamptz', nullable: true })
  lastNotifiedAt: Date | null;
}
