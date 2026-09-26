import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { SubscriptionStore } from '../subscription.enum';

/**
 * domain.md 8.4 — 스토어 서버 알림(S2S) 수신 기록. 결제 재처리의 근거라 DB 테이블로 둔다(B-8).
 *
 * `(store, notification_id)` 유니크가 **같은 알림의 중복 처리를 막는다** — 스토어는 같은 알림을
 * 여러 번 보낼 수 있다. 개인 식별자가 없어 탈퇴 시 그대로 유지한다(domain.md 12.3).
 *
 * 이 행을 쓰는 코드는 S2S 수신 경로(KAN-40)와 함께 들어온다.
 */
@Entity('store_notification_logs')
@Unique('uq_store_notification_logs_store_notification_id', [
  'store',
  'notificationId',
])
export class StoreNotificationLog extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'store', type: 'varchar', length: 20 })
  store: SubscriptionStore;

  /** 스토어가 부여한 알림 ID */
  @Column({ name: 'notification_id', type: 'varchar', length: 255 })
  notificationId: string;

  @Column({ name: 'type', type: 'varchar', length: 100 })
  type: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload: Record<string, unknown>;

  /** 반영을 마친 시각. NULL이면 받았지만 아직 처리하지 않은 알림이다 */
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
