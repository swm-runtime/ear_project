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
import { DevicePlatform } from '@/modules/user/user.enum';

import { PurchaseIntentStatus } from '../subscription.enum';
import { Plan } from './plan.entity';

/**
 * domain.md 8.3 — 결제 전 서버 관문의 기록이자 **계정 결속 토큰**이다.
 *
 * 클라이언트는 결제 시트를 열기 전에 이 행을 만들고(`subscription-api.md` 4.3), 그 `id`를 결제에 실어 보낸다
 * (iOS `appAccountToken` · Android `obfuscatedAccountId`). 스토어가 서명한 거래 안에 그 값이 담겨 돌아와
 * "이 거래를 시작한 계정"을 서명 수준에서 확인한다. 그래서 `id`는 UUID여야 한다(Apple 요구).
 *
 * 결제 결과 자체는 `subscriptions`에 남으므로 탈퇴 시 아카이브하지 않고 `users` FK CASCADE로 즉시 파기된다
 * (domain.md 12.3).
 */
@Entity('purchase_intents')
@Index('idx_purchase_intents_user_id_created_at', ['userId', 'createdAt'])
export class PurchaseIntent extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_purchase_intents_users',
  })
  user: User;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => Plan)
  @JoinColumn({
    name: 'plan_id',
    foreignKeyConstraintName: 'fk_purchase_intents_plans',
  })
  plan: Plan;

  @Column({ name: 'platform', type: 'varchar', length: 20 })
  platform: DevicePlatform;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: PurchaseIntentStatus;
}
