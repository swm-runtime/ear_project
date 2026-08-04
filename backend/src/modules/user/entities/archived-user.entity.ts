import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { SocialProvider, UserTier } from '../user.enum';

/**
 * domain.md 11.3 — 결제 이력이 있는 탈퇴 사용자만 보존한다(5년).
 *
 * 개인정보보호법 제21조 제3항이 분리 저장을 요구하므로 **별도 스키마(`archive`)** 에 둔다.
 * 원본 `users` 행이 파기되므로 **FK를 두지 않고** `user_hash`로 아카이브끼리 연결한다.
 * append-only — 이관 후 갱신하지 않는다.
 */
@Entity({ schema: 'archive', name: 'archived_users' })
@Unique('uq_archived_users_user_hash', ['userHash'])
@Index('idx_archived_users_email', ['email'])
@Index('idx_archived_users_archived_at', ['archivedAt'])
export class ArchivedUser extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_hash', type: 'varchar', length: 128 })
  userHash: string;

  @Column({ name: 'user_hash_version', type: 'smallint', default: 1 })
  userHashVersion: number;

  /** 거래 주체 식별 정보 (전자상거래법 제6조 제2항). NOT NULL — 없으면 이관을 실패시킨다 */
  @Column({ name: 'email', type: 'varchar', length: 320 })
  email: string;

  @Column({ name: 'provider', type: 'varchar', length: 20 })
  provider: SocialProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId: string;

  @Column({ name: 'tier', type: 'varchar', length: 20 })
  tier: UserTier;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt: Date;

  @Column({ name: 'withdrawn_at', type: 'timestamptz' })
  withdrawnAt: Date;

  /** 보존 시작일. 파기 배치가 `archived_at < now() - 5 years`로 대상을 찾는다 */
  @Column({ name: 'archived_at', type: 'timestamptz' })
  archivedAt: Date;
}
