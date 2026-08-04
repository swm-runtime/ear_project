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

import { User } from './user.entity';

/**
 * domain.md 3.7 — 이메일 코드 인증 1건 = 1행.
 * 발송할 때마다 행을 추가하고, 갱신하는 것은 검증 시도 관련 컬럼뿐이다.
 * 카운트 키는 `(user_id, email)`이며 발송 창은 `send_seq`로 판정한다.
 */
@Entity('email_verifications')
@Index('idx_email_verifications_user_id_email_sent_at', [
  'userId',
  'email',
  'sentAt',
])
@Index('idx_email_verifications_expires_at', ['expiresAt'])
// 동시 요청으로 같은 순번의 행이 두 개 생기는 것을 DB 제약으로 이중 방어한다 (domain.md 3.7)
@Unique('uq_email_verifications_user_id_email_send_seq_sent_at', [
  'userId',
  'email',
  'sendSeq',
  'sentAt',
])
export class EmailVerification extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_email_verifications_users',
  })
  user: User;

  /** 인증 대상 주소 — 카운트 키의 일부 */
  @Column({ name: 'email', type: 'varchar', length: 320 })
  email: string;

  /** 원문 저장 금지 (domain.md 3.3과 같은 규칙) */
  @Column({ name: 'code_hash', type: 'varchar', length: 128 })
  codeHash: string;

  /** 현재 발송 창에서 몇 번째인가 (1~5) */
  @Column({ name: 'send_seq', type: 'smallint' })
  sendSeq: number;

  /** 발송 시각 — 쿨다운·잠금 기산점 */
  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'attempt_count', type: 'smallint', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_attempted_at', type: 'timestamptz', nullable: true })
  lastAttemptedAt: Date | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  /** 재발송·[메일 다시 입력]·시도 소진 시 무효화 */
  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt: Date | null;
}
