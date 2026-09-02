import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { ConsentType } from '../user.enum';
import { User } from './user.entity';

/**
 * domain.md 3.2 — **append-only**. 동의·재동의·철회마다 새 행을 추가하고 UPDATE 하지 않는다.
 * 현재 상태는 `consent_type`별 `agreed_at` 최신 1건이다.
 */
@Entity('consents')
@Index('idx_consents_user_id_consent_type_agreed_at', [
  'userId',
  'consentType',
  'agreedAt',
])
export class Consent extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_consents_users',
  })
  user: User;

  @Column({ name: 'consent_type', type: 'varchar', length: 20 })
  consentType: ConsentType;

  /** marketing 동의는 버전이 없다 */
  @Column({ name: 'version', type: 'varchar', length: 20, nullable: true })
  version: string | null;

  /** 철회는 false 행을 추가한다 */
  @Column({ name: 'is_agreed', type: 'boolean' })
  isAgreed: boolean;

  @Column({ name: 'agreed_at', type: 'timestamptz' })
  agreedAt: Date;
}
