import { SUBSCRIPTION_COPY } from './subscription.copy';
import type { PlanGrant } from './subscription.types';

/**
 * "{이름} 프로모션 이용 중 · {요금제} · N월 N일까지"(KAN-182 · 후기 참여 KAN-280 — 이름은 서버 `grant.name`, 예: "후기 참여") — 요금제 관리·프로필·설정이 **같은 함수**로 만든다.
 * 지급 중이 아니면 null — 줄을 그리지 않는다(프로모션이 끝난 뒤 앱을 다시 열면 사라진다)
 */
export const formatPlanGrantLine = (grant: PlanGrant | null): string | null =>
  grant === null ? null : SUBSCRIPTION_COPY.grant.line(grant.name, grant.planName, grant.lastDate);
