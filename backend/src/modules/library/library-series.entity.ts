import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { Series } from '@/modules/content/entities/series.entity';
import { User } from '@/modules/user/entities/user.entity';

/**
 * domain.md 6.1-1 — 시리즈째 담기 기록(KAN-245). **새 편 자동 적립의 유일한 근거다** — 편 하나씩 담은 것·드립 적립은
 * 따라오기가 아니다. 라이브러리 목록은 이 표를 읽지 않는다(편 단위 `library_items` 그대로).
 *
 * 빼기는 소프트 삭제다 — [실행 취소](`POST /series/:id/restore`)가 `added_at`을 유지한 채 되살린다. 다시 담기는 같은 행을
 * 되살리고 `added_at`을 새로 찍는다(편 재담기와 같은 규칙).
 */
@Entity('library_series')
@Unique('uq_library_series_user_id_series_id', ['userId', 'seriesId'])
@Index('idx_library_series_series_id_deleted_at', ['seriesId', 'deletedAt'])
export class LibrarySeries extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 탈퇴 즉시 파기(domain.md 12.3) — 사용자 행 삭제가 함께 지운다 */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_library_series_users',
  })
  user: User;

  @Column({ name: 'series_id', type: 'uuid' })
  seriesId: string;

  @ManyToOne(() => Series)
  @JoinColumn({
    name: 'series_id',
    foreignKeyConstraintName: 'fk_library_series_series',
  })
  series: Series;

  @Column({ name: 'added_at', type: 'timestamptz' })
  addedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
