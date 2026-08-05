import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';

/**
 * domain.md 4.1 — 중분류 관심 주제.
 *
 * `content_count` 컬럼을 두지 않는다(B-7). 필요할 때 `content_topics` COUNT로 집계한다.
 */
@Entity('topics')
@Index('idx_topics_is_visible_display_order', ['isVisible', 'displayOrder'])
export class Topic extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'parent_category', type: 'varchar', length: 100 })
  parentCategory: string;

  /**
   * **관리자만 변경한다**(FR-38). 시스템이 자동으로 내리지 않는다.
   * 콘텐츠 풀이 없는 주제는 관리자가 여기서 내리므로,
   * 온보딩에는 "고를 수는 있는데 볼 게 없는 주제"가 존재하지 않는다(onboarding.md 3).
   */
  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;
}
