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
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';

import { DripExclusionReason } from '../drip.enum';

/**
 * domain.md 7.1 — 드립 후보에서 **영구 제외**할 콘텐츠를 사용자별로 모은다(FR-16).
 *
 * 후보 필터는 이 테이블과 `library_items` 두 줄로 정리된다:
 * "라이브러리에 있는 것 / 들은 이력이 있는 것 / 한 번 준 적 있는 것".
 *
 * **온보딩 담기는 여기에 행을 만들지 않는다** — 후보 필터의 첫 조건(`library_items`에 행이
 * 존재)이 이미 덮으며, `reason` enum에 담기에 대응하는 값이 없다(onboarding-api.md 8장).
 */
@Entity('drip_excluded_contents')
@Unique('uq_drip_excluded_contents_user_id_content_id', ['userId', 'contentId'])
@Index('idx_drip_excluded_contents_user_id', ['userId'])
export class DripExcludedContent extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_drip_excluded_contents_users',
  })
  user: User;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => Content)
  @JoinColumn({
    name: 'content_id',
    foreignKeyConstraintName: 'fk_drip_excluded_contents_contents',
  })
  content: Content;

  @Column({ name: 'reason', type: 'varchar', length: 20 })
  reason: DripExclusionReason;

  @Column({ name: 'excluded_at', type: 'timestamptz' })
  excludedAt: Date;
}
