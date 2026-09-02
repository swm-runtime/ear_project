import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

/**
 * domain.md 3.4 — 탈퇴 사유 집계용.
 * **`user_id` FK를 두지 않는다.** 탈퇴 사용자를 다시 식별할 수 있으면 탈퇴의 의미가 없다.
 * `user_hash`는 아카이브와 **다른 pepper**(`WITHDRAWAL_HASH_PEPPER`)로 만든다.
 */
@Entity('withdrawal_logs')
export class WithdrawalLog extends BaseEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_hash', type: 'varchar', length: 128 })
  userHash: string;

  @Column({ name: 'user_hash_version', type: 'smallint', default: 1 })
  userHashVersion: number;

  @Column({ name: 'reason_code', type: 'varchar', length: 50, nullable: true })
  reasonCode: string | null;

  @Column({ name: 'reason_text', type: 'text', nullable: true })
  reasonText: string | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz' })
  withdrawnAt: Date;
}
