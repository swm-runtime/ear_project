import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

import { UserMarket } from '../user.enum';
import { User } from './user.entity';

/**
 * domain.md 3.4-1 — 시장 전환 이력(`global-api.md` 4.11, 2026-10-19 — KAN-227). 전환 한 번에 한 행이고 쓰고 나면 바꾸지 않는다.
 * 현재 시장의 원천은 `users.market`이고 이 표는 하루 1회 판정·전환 수 집계·문의 대응용이다. 탈퇴하면 함께 지운다(CASCADE).
 */
@Entity('user_market_changes')
@Index('idx_user_market_changes_user_id_changed_at', ['userId', 'changedAt'])
export class UserMarketChange extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_market_changes_users',
  })
  user: User;

  @Column({ name: 'from_market', type: 'varchar', length: 10 })
  fromMarket: UserMarket;

  @Column({ name: 'to_market', type: 'varchar', length: 10 })
  toMarket: UserMarket;

  /**
   * 재온보딩을 끝내기 전 직전 시장으로 되돌린 행. 하루 1회에서 뺀 전환이라 **되돌리기를 다시 되돌릴 수는 없다** — 이 표시가 없으면
   * "직전 행의 반대 방향" 판정이 매번 성립해 온보딩 중에 무한히 오갈 수 있다. 일일 보고의 전환 수에서도 뺀다
   */
  @Column({ name: 'is_revert', type: 'boolean', default: false })
  isRevert: boolean;

  /** 하루 1회 판정이 서비스 날짜를 계산하는 업무 시각 — 전환 트랜잭션의 `now` */
  @Column({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
