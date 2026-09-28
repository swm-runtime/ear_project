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
   * **켜기는 관리자만 한다**(FR-38). 내리기는 `TopicExposureService`가 발행 콘텐츠 0건 주제를
   * 자동으로 숨긴다(2026-09-17, KAN-58) — 그래서 온보딩에는 "고를 수는 있는데 볼 게 없는 주제"가
   * 존재하지 않는다(onboarding.md 3).
   */
  // domain.md 4.1 — **기본값은 false다.** true면 생성 즉시 0건 주제가 온보딩·탐색에 노출된다
  @Column({ name: 'is_visible', type: 'boolean', default: false })
  isVisible: boolean;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;
}
