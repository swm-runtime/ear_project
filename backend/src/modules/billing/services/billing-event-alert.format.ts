/**
 * 결제 알림 Slack 문구 — **순수 함수만 둔다**(`features/backend-monitoring.md` 3-7 — 2026-10-18). 조회는
 * `BillingEventAlertService`가 하고, 여기서는 받은 값을 사람이 읽는 한 줄로 바꾼다.
 *
 * **신원 값을 받지 않는다** — 입력 타입에 사용자·거래·주문 식별자 자리가 없다. 채널에 필요한 것은 "누가"가 아니라
 * "어느 스토어·요금제·시장에서 결제가 일어났다"이다(`slack-alert.service.ts` 상단 · CLAUDE.md 공통 원칙).
 */

import { escapeSlackText } from '@/modules/alert/slack-alert.service';
import {
  SubscriptionEnvironment,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import { StorePurchaseDetail } from '@/modules/subscription/subscription.types';
import { UserMarket, UserTier } from '@/modules/user/user.enum';

import { SubscriptionTransitionKind } from '../billing.types';

export const STORE_LABEL: Readonly<Record<SubscriptionStore, string>> = {
  [SubscriptionStore.APP_STORE]: 'App Store',
  [SubscriptionStore.PLAY_STORE]: 'Google Play',
};

/** 심사·TestFlight·라이선스 테스터 결제는 운영 서버에도 Sandbox 로 들어온다 — 매출로 읽히지 않게 한눈에 가른다 */
const ENVIRONMENT_LABEL: Readonly<Record<SubscriptionEnvironment, string>> = {
  [SubscriptionEnvironment.PRODUCTION]: 'Production',
  [SubscriptionEnvironment.SANDBOX]: 'Sandbox(시험 결제)',
};

export const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const AMOUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export interface BillingEventAlertInput {
  kind: SubscriptionTransitionKind;
  isResubscribe: boolean;
  store: SubscriptionStore;
  environment: SubscriptionEnvironment;
  tier: UserTier;
  /** `users.market`. 조회하지 못했으면 `null`(그 칸을 뺀다) */
  market: UserMarket | null;
  detail: StorePurchaseDetail | null;
  at: Date;
}

/** 사건의 제목 — 체험이 결제보다 먼저 보이게 한다(체험 시작은 아직 돈이 오가지 않았다) */
function titleOf(input: BillingEventAlertInput): string {
  switch (input.kind) {
    case 'started':
      if (input.detail?.isTrial === true) {
        return ':seedling: 무료 체험 시작';
      }
      return input.isResubscribe ? ':tada: 재구독' : ':tada: 신규 구독';
    case 'refunded':
      return ':money_with_wings: 환불·철회';
    case 'cancel_scheduled':
      return ':wave: 해지 예약';
  }
}

/** 금액은 결제가 오간 사건(유료 시작·환불)에만 싣는다. 체험·해지 예약에는 싣지 않는다 */
function priceOf(input: BillingEventAlertInput): string | null {
  const price = input.detail?.price ?? null;

  if (
    price === null ||
    input.kind === 'cancel_scheduled' ||
    input.detail?.isTrial === true
  ) {
    return null;
  }

  return `${AMOUNT.format(price.amount)} ${escapeSlackText(price.currency)}`;
}

/**
 * `:tada: 신규 구독 · App Store · Production · daily · 시장 KR · 국가 KOR · 4,900 KRW · 10. 18. 14:03`
 *
 * 모르는 값(시장·국가·금액)은 칸째 뺀다. 스토어가 준 문자열(국가·통화)은 `escapeSlackText`를 거친다.
 */
export function formatBillingEventAlert(input: BillingEventAlertInput): string {
  const storefront = input.detail?.storefront ?? null;

  return [
    titleOf(input),
    STORE_LABEL[input.store],
    ENVIRONMENT_LABEL[input.environment],
    input.tier,
    input.market === null ? null : `시장 ${input.market.toUpperCase()}`,
    storefront === null ? null : `국가 ${escapeSlackText(storefront)}`,
    priceOf(input),
    KST_TIME.format(input.at),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
