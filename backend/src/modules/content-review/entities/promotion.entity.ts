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
import { InviteCodeRedemption } from '@/modules/subscription/entities/invite-code-redemption.entity';
import { User } from '@/modules/user/entities/user.entity';
import { UserTier } from '@/modules/user/user.enum';

import { PromotionKind } from '../content-review.enum';

/**
 * 후기 참여 프로모션 — domain.md 8.7 (KAN-279, `content-review.md` 4.4 · 4.5).
 *
 * **발급해 두고 사용자가 원할 때 쓰는 보상**이다. 발급은 지급이 아니다 — 쓰기 전에는 `users.tier`도
 * `invite_code_redemptions`도 건드리지 않는다. `(user_id, kind)` 유니크가 계정당 1회를 DB에서 보장하고(동시 발급에도 1장),
 * 쓰거나 소멸해도 행을 지우지 않는다. **소멸은 상태 컬럼이 아니라 판정이다**(`now ≥ expires_at`).
 * `invite_code_redemption_id`는 사용으로 생긴 지급 행(`subscription` 소유)을 가리킨다 — FK 를 스키마와 맞추려고 엔티티 관계만
 * 선언하고, 그 표를 쓰는 일은 `billing`이 `InviteCodeService`로 한다(이 모듈은 `subscription`을 의존하지 않는다 — domain.md 2장).
 */
@Entity('promotions')
@Unique('uq_promotions_user_id_kind', ['userId', 'kind'])
@Index('uq_promotions_invite_code_redemption_id', ['inviteCodeRedemptionId'], {
  unique: true,
  where: '"invite_code_redemption_id" IS NOT NULL',
})
export class Promotion extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_promotions_users',
  })
  user: User;

  @Column({ name: 'kind', type: 'varchar', length: 30 })
  kind: PromotionKind;

  /** 지급 요금제 — 발급 때 값의 사본(나중에 상수를 바꿔도 받은 사람의 조건이 그대로다) */
  @Column({ name: 'tier', type: 'varchar', length: 20 })
  tier: UserTier;

  /** 쓴 서비스 날짜를 1일째로 센 지급 일수 — 발급 때 값의 사본 */
  @Column({ name: 'grant_days', type: 'int' })
  grantDays: number;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  /** 소멸 시각(배타 경계 — 발급 서비스 날짜 3개월 뒤 같은 날짜의 서비스 날짜 시작) */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true })
  redeemedAt: Date | null;

  /** 사용으로 생긴 지급 행(`invite_code_redemptions` — 내부 캠페인 `REVIEW-REWARD`) */
  @Column({
    name: 'invite_code_redemption_id',
    type: 'uuid',
    nullable: true,
  })
  inviteCodeRedemptionId: string | null;

  @ManyToOne(() => InviteCodeRedemption, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'invite_code_redemption_id',
    foreignKeyConstraintName: 'fk_promotions_invite_code_redemptions',
  })
  inviteCodeRedemption: InviteCodeRedemption | null;
}
