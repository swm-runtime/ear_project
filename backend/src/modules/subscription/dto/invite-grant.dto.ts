import { UserTier } from '@/modules/user/user.enum';

import { InviteGrantView } from '../subscription.types';

/**
 * 초대 코드로 받은 요금제(`subscription-api.md` 4.8) — 구독 조회·프로필·설정의 `plan.grant`가 같은 모양으로 나간다
 * (조립은 `buildPlanView` 하나). 지급 중이 아니면 `null`.
 */
export class InviteGrantDto {
  /** 코드(캠페인) 이름 — 화면에 쓸지는 클라이언트가 정한다 */
  readonly name: string;
  readonly tier: UserTier;
  readonly plan_name: string;
  /** 지급이 끝나는 시각(ISO 8601 UTC) */
  readonly ends_at: string;
  /** 지급으로 쓸 수 있는 마지막 날(`YYYY-MM-DD`, 서비스 날짜) — "N월 N일까지" */
  readonly last_date: string;

  static from(view: InviteGrantView | null): InviteGrantDto | null {
    return view === null
      ? null
      : {
          name: view.name,
          tier: view.tier,
          plan_name: view.planName,
          ends_at: view.endsAt.toISOString(),
          last_date: view.lastDate,
        };
  }
}
