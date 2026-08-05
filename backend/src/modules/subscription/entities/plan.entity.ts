import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { UserTier } from '@/modules/user/user.enum';

/**
 * domain.md 8.1 — 티어별 정책을 데이터로 표현한다.
 *
 * **`plans`에는 `light` 행이 존재한다.** 무료 정책(하루 재생 2편, 드립 2편)을 코드 상수가
 * 아니라 데이터로 두기 위해서다. `subscriptions`에는 `light` 행이 생기지 않는다.
 *
 * `offline_download_enabled`를 두지 않는다 — 오프라인 저장이 P1 이연이라 지금 만들면
 * 의미 없는 값이 채워진다.
 */
@Entity('plans')
@Unique('uq_plans_tier', ['tier'])
export class Plan extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tier', type: 'varchar', length: 20 })
  tier: UserTier;

  @Column({ name: 'name', type: 'varchar', length: 50 })
  name: string;

  @Column({ name: 'description', type: 'text' })
  description: string;

  /** null = 무제한 */
  @Column({ name: 'daily_play_limit', type: 'int', nullable: true })
  dailyPlayLimit: number | null;

  /**
   * 일일 자동 적립 편수. `drip-scheduling.md`가 "서버 설정값"이라고만 해서 소유처가
   * 없었으므로 여기에 둔다 — 티어별로 달라질 값이기 때문이다.
   */
  @Column({ name: 'daily_drip_count', type: 'int' })
  dailyDripCount: number;

  @Column({ name: 'is_drip_enabled', type: 'boolean' })
  isDripEnabled: boolean;

  @Column({ name: 'is_ads_enabled', type: 'boolean' })
  isAdsEnabled: boolean;

  @Column({ name: 'price_krw', type: 'int' })
  priceKrw: number;

  @Column({
    name: 'store_product_id_ios',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  storeProductIdIos: string | null;

  @Column({
    name: 'store_product_id_android',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  storeProductIdAndroid: string | null;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
