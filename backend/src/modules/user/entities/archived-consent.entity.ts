import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { ConsentType } from '../user.enum';

/** domain.md 11.4 — 탈퇴 시 `consents` 전 이력을 해시로 치환해 이관한다(5년) */
@Entity({ schema: 'archive', name: 'archived_consents' })
@Index('idx_archived_consents_user_hash', ['userHash'])
@Index('idx_archived_consents_archived_at', ['archivedAt'])
export class ArchivedConsent extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_hash', type: 'varchar', length: 128 })
  userHash: string;

  @Column({ name: 'user_hash_version', type: 'smallint', default: 1 })
  userHashVersion: number;

  @Column({ name: 'consent_type', type: 'varchar', length: 20 })
  consentType: ConsentType;

  @Column({ name: 'version', type: 'varchar', length: 20, nullable: true })
  version: string | null;

  @Column({ name: 'is_agreed', type: 'boolean' })
  isAgreed: boolean;

  @Column({ name: 'agreed_at', type: 'timestamptz' })
  agreedAt: Date;

  @Column({ name: 'archived_at', type: 'timestamptz' })
  archivedAt: Date;
}
