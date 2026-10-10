import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '@/modules/user/entities/user.entity';

import { BaseEntity } from '@/database/base.entity';

import { SessionRevokedReason } from './auth.enum';

/**
 * domain.md 3.3 — 다중 기기 동시 로그인을 허용한다. 로그아웃은 해당 기기 세션만 폐기한다.
 * **원문 토큰을 저장하지 않는다.**
 */
@Entity('sessions')
@Index('idx_sessions_user_id', ['userId'])
@Index('idx_sessions_refresh_token_hash', ['refreshTokenHash'])
export class Session extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_sessions_users',
  })
  user: User;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 128 })
  refreshTokenHash: string;

  @Column({ name: 'device_id', type: 'varchar', length: 200 })
  deviceId: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** 회전·로그아웃 등으로 폐기된 시각. 왜 폐기됐는지는 `revokedReason` (architecture.md 9.1) */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /**
   * 폐기 사유(domain.md 3.3, 2026-10-10 — KAN-167). **회전(`rotated`)된 토큰의 재제출만 탈취로 본다.**
   * 폐기 때 `revoked_at`과 함께 쓴다. NULL은 활성 세션이거나 컬럼 도입 전에 폐기된 행이다(사유 모름 → 회전으로 취급).
   */
  @Column({
    name: 'revoked_reason',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  revokedReason: SessionRevokedReason | null;
}
