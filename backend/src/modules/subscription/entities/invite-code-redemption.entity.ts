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
import { UserTier } from '@/modules/user/user.enum';

import { InviteCode } from './invite-code.entity';

/**
 * domain.md 8.6 — 초대 코드 사용 기록이자 **요금제 지급 기간**이다.
 *
 * `users.tier` 캐시는 결제 반영(`BillingSyncService.syncUserTier`)이 구독과 이 행 중 **높은 쪽**으로 맞춘다 — 그래서
 * 재생 한도·음질·광고·드립 같은 기존 판정은 고치지 않고 지급 요금제를 따른다. 기간이 끝난 행은 만료 배치가 캐시를
 * 다시 맞추고 `tier_released_at`을 찍는다.
 *
 * 탈퇴하면 `users` FK CASCADE로 함께 지워진다(domain.md 12.3). 코드의 사용 수(`redeemed_count`)는 줄지 않는다.
 */
@Entity('invite_code_redemptions')
@Index('uq_invite_code_redemptions_code_user', ['inviteCodeId', 'userId'], {
  unique: true,
})
@Index('idx_invite_code_redemptions_user_id_ends_at', ['userId', 'endsAt'])
@Index('idx_invite_code_redemptions_unreleased_ends_at', ['endsAt'], {
  where: '"tier_released_at" IS NULL',
})
export class InviteCodeRedemption extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invite_code_id', type: 'uuid' })
  inviteCodeId: string;

  @ManyToOne(() => InviteCode, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'invite_code_id',
    foreignKeyConstraintName: 'fk_invite_code_redemptions_invite_codes',
  })
  inviteCode: InviteCode;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_invite_code_redemptions_users',
  })
  user: User;

  /** 지급한 요금제 — 입력 시점의 코드 값을 옮겨 둔다(코드를 나중에 고쳐도 받은 사람의 기간은 그대로) */
  @Column({ name: 'tier', type: 'varchar', length: 20 })
  tier: UserTier;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  /** 지급이 끝나는 시각(배타 경계) — 서비스 날짜 경계에 맞춘다(가입 체험과 같은 이유 — `signup-trial.util.ts`) */
  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  /**
   * 입력할 때 살아 있는 유료 구독이 있었는가. **없었는데 지금 살아 있는 구독이 있으면 지급 기간 중에 결제한 것**이라 결제 반영이
   * 지급을 끝낸다(결제가 지급을 대체). 구독 행의 생성 시각으로 판정하지 않는 이유: App Store 재구독·끝난 구독의 계정 이전은
   * 옛 행을 되살려 생성 시각이 지급보다 앞선다(2026-10-10 검토).
   */
  @Column({ name: 'subscribed_at_start', type: 'boolean', default: false })
  subscribedAtStart: boolean;

  /** 기간이 끝나 `users.tier`를 다시 맞춘 시각. `null`이면 아직 지급 중이거나 만료 배치가 돌기 전이다 */
  @Column({ name: 'tier_released_at', type: 'timestamptz', nullable: true })
  tierReleasedAt: Date | null;
}
