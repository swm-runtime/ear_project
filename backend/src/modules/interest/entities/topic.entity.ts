import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { UserMarket } from '@/modules/user/user.enum';

/**
 * domain.md 4.1 — 중분류 관심 주제.
 *
 * `content_count` 컬럼을 두지 않는다(B-7). 필요할 때 `content_topics` COUNT로 집계한다.
 */
@Entity('topics')
@Index('idx_topics_is_visible_display_order', ['isVisible', 'displayOrder'])
@Index('idx_topics_market_is_visible_display_order', [
  'market',
  'isVisible',
  'displayOrder',
])
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

  /**
   * 안정 키(`global-api.md` 4.5) — 앱의 주제 이미지·아이콘 매핑 키. 이름이 아니라 이것으로 매핑한다(한국어 이름 키 폐기).
   * 시장 안에서 유일. 기존 KR 주제는 운영이 채울 때까지 NULL(클라이언트는 NULL이면 기본 이미지)
   */
  @Column({ name: 'slug', type: 'varchar', length: 64, nullable: true })
  slug: string | null;

  /** 시장(`global-api.md` 4.5) — 주제는 번역 테이블이 아니라 시장별 별도 행이다. 사용자 시장의 주제만 보인다 */
  @Column({
    name: 'market',
    type: 'varchar',
    length: 20,
    default: UserMarket.KR,
  })
  market: UserMarket;
}
