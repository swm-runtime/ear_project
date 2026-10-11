import { InviteCode } from '@/modules/subscription/entities/invite-code.entity';
import { UserTier } from '@/modules/user/user.enum';

/**
 * admin-api.md 4.23 — 초대 코드 한 줄. 사용자 식별 정보는 없다 — 사용 수·지급 중 수만 싣는다(집계만).
 */
export class AdminInviteCodeItemDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly tier: UserTier;
  readonly grant_days: number | null;
  readonly grant_until_date: string | null;
  readonly max_redemptions: number | null;
  /** 지금까지 사용한 계정 수(탈퇴해도 줄지 않는다) */
  readonly redeemed_count: number;
  /** 지금 지급 중인 계정 수 — 목록에서만 실린다. 만들기·고치기 응답은 `null` */
  readonly active_count: number | null;
  readonly redeemable_from: string | null;
  readonly redeemable_until: string | null;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;

  static from(
    code: InviteCode,
    activeCount: number | null = null,
  ): AdminInviteCodeItemDto {
    return {
      id: code.id,
      code: code.code,
      name: code.name,
      tier: code.tier,
      grant_days: code.grantDays,
      grant_until_date: code.grantUntilDate,
      max_redemptions: code.maxRedemptions,
      redeemed_count: code.redeemedCount,
      active_count: activeCount,
      redeemable_from: code.redeemableFrom?.toISOString() ?? null,
      redeemable_until: code.redeemableUntil?.toISOString() ?? null,
      is_active: code.isActive,
      created_at: code.createdAt.toISOString(),
      updated_at: code.updatedAt.toISOString(),
    };
  }
}

export class AdminInviteCodeListResponseDto {
  readonly items: AdminInviteCodeItemDto[];
}
