import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { User } from '@/modules/user/entities/user.entity';

import {
  NotificationSkipReason,
  NotificationStatus,
  NotificationType,
} from '../notification.enum';

/**
 * domain.md 9.1 — 푸시 발송 기록. **중복 발송 방지에 쓰므로** 구조화 로그가 아니라 테이블이다(B-8).
 *
 * 사용자 한 명의 알림 1건 = 1행이다. 기기가 여러 대여도 행은 하나이고, 기기별 결과는 남기지 않는다 —
 * 하루 1건 판정과 운영 지표(발송·건너뜀 사유)가 사용자 단위이기 때문이다.
 * 탈퇴 시 `users` FK의 CASCADE로 즉시 파기된다(domain.md 12.3). 보존 기간은 retention 배치가 집행한다.
 */
@Entity('notification_logs')
@Index('idx_notification_logs_user_id_scheduled_at', ['userId', 'scheduledAt'])
@Index('idx_notification_logs_created_at', ['createdAt'])
export class NotificationLog extends BaseEntity {
  /** 대량 로그성 테이블이라 bigserial이다 (domain.md 1.1 예외 조항) */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_notification_logs_users',
  })
  user: User;

  @Column({ name: 'type', type: 'varchar', length: 40 })
  type: NotificationType;

  @Column({ name: 'deep_link', type: 'varchar', length: 2048, nullable: true })
  deepLink: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: NotificationStatus;

  @Column({ name: 'skip_reason', type: 'varchar', length: 20, nullable: true })
  skipReason: NotificationSkipReason | null;

  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt: Date | null;
}
