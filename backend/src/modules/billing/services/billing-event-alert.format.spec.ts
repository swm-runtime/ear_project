import {
  SubscriptionEnvironment,
  SubscriptionStatus,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import { UserMarket, UserTier } from '@/modules/user/user.enum';

import {
  BillingEventAlertInput,
  formatBillingEventAlert,
} from './billing-event-alert.format';
import { resolveTransitionKind } from './billing-sync.service';

const AT = new Date('2026-10-18T05:03:00Z');

function input(
  overrides: Partial<BillingEventAlertInput> = {},
): BillingEventAlertInput {
  return {
    kind: 'started',
    isResubscribe: false,
    store: SubscriptionStore.APP_STORE,
    environment: SubscriptionEnvironment.PRODUCTION,
    tier: UserTier.DAILY,
    market: UserMarket.KR,
    detail: {
      isTrial: false,
      isRenewal: false,
      storefront: 'KOR',
      price: { amount: 3900, currency: 'KRW' },
    },
    at: AT,
    ...overrides,
  };
}

describe('formatBillingEventAlert — 결제 알림 문구(backend-monitoring.md 3-7)', () => {
  it('신규 구독은 스토어·환경·요금제·시장·국가·금액·KST 시각 순이다', () => {
    expect(formatBillingEventAlert(input())).toBe(
      ':tada: 신규 구독 · App Store · Production · daily · 시장 KR · 국가 KOR · 3,900 KRW · 10. 18. 14:03',
    );
  });

  it('Sandbox 는 시험 결제로 적는다 — 심사·테스트 결제가 운영 서버에도 들어온다', () => {
    expect(
      formatBillingEventAlert(
        input({
          store: SubscriptionStore.PLAY_STORE,
          environment: SubscriptionEnvironment.SANDBOX,
          market: UserMarket.GLOBAL,
          detail: {
            isTrial: false,
            isRenewal: null,
            storefront: 'US',
            price: null,
          },
        }),
      ),
    ).toBe(
      ':tada: 신규 구독 · Google Play · Sandbox(시험 결제) · daily · 시장 GLOBAL · 국가 US · 10. 18. 14:03',
    );
  });

  it('체험 시작은 체험으로 적고 금액을 싣지 않는다 — 재구독이어도 체험이 앞선다', () => {
    expect(
      formatBillingEventAlert(
        input({
          isResubscribe: true,
          detail: {
            isTrial: true,
            isRenewal: false,
            storefront: null,
            price: { amount: 0, currency: 'KRW' },
          },
        }),
      ),
    ).toBe(
      ':seedling: 무료 체험 시작 · App Store · Production · daily · 시장 KR · 10. 18. 14:03',
    );
  });

  it('재구독·환불·해지 예약의 제목. 해지 예약에는 금액이 없다', () => {
    expect(formatBillingEventAlert(input({ isResubscribe: true }))).toMatch(
      /^:tada: 재구독 · /,
    );
    expect(formatBillingEventAlert(input({ kind: 'refunded' }))).toBe(
      ':money_with_wings: 환불·철회 · App Store · Production · daily · 시장 KR · 국가 KOR · 3,900 KRW · 10. 18. 14:03',
    );
    expect(formatBillingEventAlert(input({ kind: 'cancel_scheduled' }))).toBe(
      ':wave: 해지 예약 · App Store · Production · daily · 시장 KR · 국가 KOR · 10. 18. 14:03',
    );
  });

  it('모르는 값(시장·부가 사실)은 칸째 뺀다. 소수 금액은 둘째 자리까지', () => {
    expect(formatBillingEventAlert(input({ market: null, detail: null }))).toBe(
      ':tada: 신규 구독 · App Store · Production · daily · 10. 18. 14:03',
    );
    expect(
      formatBillingEventAlert(
        input({
          detail: {
            isTrial: false,
            isRenewal: false,
            storefront: 'USA',
            price: { amount: 4.99, currency: 'USD' },
          },
        }),
      ),
    ).toContain('국가 USA · 4.99 USD');
  });

  it('스토어가 준 문자열의 Slack 제어 문자는 무력화한다', () => {
    expect(
      formatBillingEventAlert(
        input({
          detail: {
            isTrial: false,
            isRenewal: false,
            storefront: '<!channel>',
            price: null,
          },
        }),
      ),
    ).toContain('국가 &lt;!channel&gt;');
  });
});

describe('resolveTransitionKind — 반영 전후 상태로 결제 알림 전이를 가른다', () => {
  const live = (isAutoRenew = true) => ({
    status: isAutoRenew
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.CANCELLED,
    isAutoRenew,
  });
  const ended = (status: SubscriptionStatus) => ({
    status,
    isAutoRenew: false,
  });

  it.each([
    ['행 없음 → 유효', null, live(), 'started'],
    ['행 없음 → 해지 예약 상태로 시작', null, live(false), 'started'],
    [
      '만료 → 유효(재구독)',
      ended(SubscriptionStatus.EXPIRED),
      live(),
      'started',
    ],
    ['유효 → 환불', live(), ended(SubscriptionStatus.REFUNDED), 'refunded'],
    [
      '만료 → 환불(만료 뒤 환불)',
      ended(SubscriptionStatus.EXPIRED),
      ended(SubscriptionStatus.REFUNDED),
      'refunded',
    ],
    ['유효 → 해지 예약', live(), live(false), 'cancel_scheduled'],
    ['유효 → 유효(갱신)', live(), live(), null],
    ['해지 예약 → 유효(다시 켬)', live(false), live(), null],
    ['유효 → 만료', live(), ended(SubscriptionStatus.EXPIRED), null],
    [
      '환불 → 환불(재전송)',
      ended(SubscriptionStatus.REFUNDED),
      ended(SubscriptionStatus.REFUNDED),
      null,
    ],
    ['행 없음 → 만료', null, ended(SubscriptionStatus.EXPIRED), null],
    [
      '행 없음 → 환불(모르는 구독의 환불)',
      null,
      ended(SubscriptionStatus.REFUNDED),
      null,
    ],
  ] as const)('%s', (_label, previous, next, expected) => {
    expect(resolveTransitionKind(previous, next)).toBe(expected);
  });
});
