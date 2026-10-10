import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { BaseEntity } from '@/database/base.entity';
import { UserTier } from '@/modules/user/user.enum';

/**
 * domain.md 8.5 — 초대 코드(PoC·제휴용 요금제 무상 지급, 2026-10-10).
 *
 * 코드 하나가 **한 캠페인**이다. 제휴사·PoC 가 여럿이라 코드도 여럿이고, 코드마다 지급 요금제·기간·사용 한도가 다르다.
 * 사용자는 소셜 가입(개인 메일)을 그대로 하고 앱에서 코드를 입력하면 그 계정에 요금제가 지급된다 — 회사 메일 도메인으로
 * 판정하지 않는 이유는 소셜 가입만 지원해 회사 메일로 가입할 방법이 없어서다.
 *
 * 지급 기간은 **둘 중 하나**다: 입력한 날부터 N일(`grant_days`) 또는 정해진 날까지(`grant_until_date`, 서비스 날짜).
 */
@Entity('invite_codes')
@Index('uq_invite_codes_code', ['code'], { unique: true })
export class InviteCode extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 사용자가 입력하는 값 — 대문자로 정규화해 저장한다(입력도 같은 규칙으로 정규화해 찾는다) */
  @Column({ name: 'code', type: 'varchar', length: 32 })
  code: string;

  /** 캠페인 이름(예: "산군 PoC"). 운영 식별용이고 응답에도 실린다 — 화면에 쓸지는 클라이언트가 정한다 */
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  /** 지급하는 요금제 — 유료 티어(`daily` · `pro`)만 */
  @Column({ name: 'tier', type: 'varchar', length: 20 })
  tier: UserTier;

  /** 입력한 서비스 날짜를 1일째로 센 지급 일수. `grant_until_date`와 둘 중 하나만 있다 */
  @Column({ name: 'grant_days', type: 'int', nullable: true })
  grantDays: number | null;

  /** 지급이 끝나는 마지막 서비스 날짜(`YYYY-MM-DD`, 그날까지 포함). `grant_days`와 둘 중 하나만 있다 */
  @Column({ name: 'grant_until_date', type: 'date', nullable: true })
  grantUntilDate: string | null;

  /** 사용 한도(계정 수). `null` = 제한 없음 */
  @Column({ name: 'max_redemptions', type: 'int', nullable: true })
  maxRedemptions: number | null;

  /** 지금까지 사용한 계정 수 — 한도 판정을 코드 행 잠금 하나로 하려고 세어 둔다(탈퇴해도 줄지 않는다) */
  @Column({ name: 'redeemed_count', type: 'int', default: 0 })
  redeemedCount: number;

  /** 입력을 받기 시작하는 시각. `null` = 만든 즉시 */
  @Column({ name: 'redeemable_from', type: 'timestamptz', nullable: true })
  redeemableFrom: Date | null;

  /** 입력을 더 받지 않는 시각(배타). `null` = 기한 없음 — 이미 지급된 기간은 그대로다 */
  @Column({ name: 'redeemable_until', type: 'timestamptz', nullable: true })
  redeemableUntil: Date | null;

  /** 끄면 새 입력만 막는다. 이미 지급된 기간은 회수하지 않는다 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
