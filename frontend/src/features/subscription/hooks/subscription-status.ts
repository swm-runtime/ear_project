import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { MySubscription, PendingPlan, SubscriptionStore } from '../subscription.types';

/**
 * 현재 구독 카드 VM(SB1) — 서버가 정규화한 status 4분기를 그대로 실어 나른다. 만료·해지 판정을 하지 않는다
 * (기기 시각을 정책 판정에 쓰지 않는다 — CLAUDE.md 공통 원칙).
 */
export type SubscriptionStatusVM =
  | { kind: 'free'; dailyPlayLimit: number | null }
  | {
      kind: 'subscribed';
      planName: string;
      renewsAt: string | null;
      pendingPlan: PendingPlan | null;
      /** 다른 스토어에서 결제한 구독 — 이 기기에서는 변경할 수 없다 */
      otherStore: SubscriptionStore | null;
    }
  | {
      kind: 'cancelScheduled';
      planName: string;
      expiresAt: string | null;
      otherStore: SubscriptionStore | null;
    }
  | { kind: 'grace'; planName: string; otherStore: SubscriptionStore | null };

export const toSubscriptionStatusVM = (
  subscription: MySubscription,
  thisStore: SubscriptionStore,
): SubscriptionStatusVM => {
  const { plan, store, pendingPlan } = subscription;
  const otherStore = store !== null && store !== thisStore ? store : null;
  switch (plan.status) {
    case 'free':
      return { kind: 'free', dailyPlayLimit: plan.dailyPlayLimit };
    case 'subscribed':
      return {
        kind: 'subscribed',
        planName: plan.planName,
        renewsAt: plan.renewsAt,
        pendingPlan,
        otherStore,
      };
    case 'cancel_scheduled':
      return {
        kind: 'cancelScheduled',
        planName: plan.planName,
        expiresAt: plan.expiresAt,
        otherStore,
      };
    case 'grace':
      return { kind: 'grace', planName: plan.planName, otherStore };
  }
};

/**
 * 요금제 관리 제목 밑 알림 섹션의 문구(KAN-160 — 팀 결정 2026-10-08). **예약된 변경이 있을 때만** 문자열, 없으면 null(섹션 없음).
 * 판정은 서버 값으로만 한다 — 다운그레이드 예약은 `pending_plan`, 해지 예약은 `plan.status = cancel_scheduled` 와 `expires_at`.
 * `freePlanName` 은 요금제 목록에서 무료 요금제의 서버 이름(티어명을 앱이 만들지 않는다). 모르면 "무료"
 */
export const scheduledChangeNotice = (
  status: SubscriptionStatusVM | null,
  freePlanName: string | null,
): string | null => {
  if (status === null) return null;
  if (status.kind === 'subscribed' && status.pendingPlan !== null) {
    return SUBSCRIPTION_COPY.status.pendingPlan(
      status.pendingPlan.effectiveAt,
      status.pendingPlan.planName,
    );
  }
  if (status.kind === 'cancelScheduled' && status.expiresAt !== null) {
    return SUBSCRIPTION_COPY.status.cancelScheduledNotice(
      status.expiresAt,
      status.planName,
      freePlanName,
    );
  }
  return null;
};
