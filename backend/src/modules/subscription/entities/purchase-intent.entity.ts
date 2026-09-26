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
 * domain.md 8.3 — 결제 멱등키. 결제 버튼 연타로 인한 중복 결제 요청을 막는다(`paywall.md` 7).
 *
 * `id`가 곧 멱등키다 — 클라이언트는 결제 시트를 열기 전에 이 행을 만들고, 영수증 제출 시
 * 같은 `id`를 함께 보낸다(`subscription.md` 4.2 2단계). 결제 결과 자체는 `subscriptions`에
 * 남으므로 탈퇴 시 아카이브하지 않고 `users` FK CASCADE로 즉시 파기된다(domain.md 12.3).
 *
 * 이 행을 쓰는 코드는 영수증 검증(KAN-40)과 함께 들어온다 — 테이블은 문서가 정한 대로 먼저 둔다.
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
