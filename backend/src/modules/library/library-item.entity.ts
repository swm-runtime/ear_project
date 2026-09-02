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
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';

import { LibraryItemSource, LibraryItemStatus } from './library.enum';

/**
 * domain.md 6.1 — 드립·담기·온보딩이 하나의 통합 목록으로 들어온다(FR-20).
 *
 * `uq_library_items_user_id_content_id`가 **중복 적립 방지의 최종 방어선이다**(A-5).
 * 드립과 사용자 담기가 동시에 같은 콘텐츠를 적립해도 DB가 1건만 남긴다.
 *
 * `resume_position_sec` · `deleted_reason`을 두지 않는다(A-1 · A-4).
 * 재생 위치는 `playback_progresses`가 단독 소유하고, 삭제 경로는 구분하지 않는다.
 *
 * 목록 인덱스의 `added_at DESC` · `last_played_at DESC` 정렬 방향은 TypeORM `@Index`가
 * 표현하지 못해 오름차순으로 만든다. 단일 방향 정렬은 역방향 스캔으로 처리되며,
 * 커서 페이지네이션이 들어오는 `library-api` 작업 때 실측 후 조정한다.
 */
@Entity('library_items')
@Unique('uq_library_items_user_id_content_id', ['userId', 'contentId'])
@Index('idx_library_items_user_id_deleted_at_added_at_id', [
  'userId',
  'deletedAt',
  'addedAt',
  'id',
])
@Index('idx_library_items_user_id_deleted_at_last_played_at', [
  'userId',
  'deletedAt',
  'lastPlayedAt',
])
@Index('idx_library_items_content_id', ['contentId'])
export class LibraryItem extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_library_items_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content)
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_library_items_contents',
  })
  content: Content;

  @Column({ name: 'source', type: 'varchar', length: 20 })
  source: LibraryItemSource;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: LibraryItemStatus.UNPLAYED,
  })
  status: LibraryItemStatus;

  @Column({ name: 'added_at', type: 'timestamptz' })
  addedAt: Date;

  @Column({ name: 'last_played_at', type: 'timestamptz', nullable: true })
  lastPlayedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** 소프트 삭제. 삭제해도 재생 이력·드립 영구 제외 판정은 남아야 한다 */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
