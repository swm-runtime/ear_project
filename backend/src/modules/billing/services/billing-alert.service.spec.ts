import { SlackAlertService } from '@/modules/alert/slack-alert.service';
import { SubscriptionStore } from '@/modules/subscription/subscription.enum';

import {
  BILLING_ALERT_WINDOW_MS,
  BillingAlertService,
} from './billing-alert.service';

const NOW = new Date('2026-10-06T09:00:00Z');

function build() {
  const slack = {
    notify: jest.fn(),
  } as unknown as jest.Mocked<SlackAlertService>;
  return { service: new BillingAlertService(slack), slack };
}

describe('BillingAlertService — 결제·스토어 알림 실패를 Slack 으로(runbook 4-1)', () => {
  it('영수증 거부는 스토어·사유와 함께 한 줄, 식별자 없음', () => {
    const { service, slack } = build();

    service.receiptRejected(
      SubscriptionStore.APP_STORE,
      'bundle mismatch',
      NOW,
    );

    expect(slack.notify).toHaveBeenCalledWith(
      'billing-receipt-rejected',
      ':credit_card: 결제 검증 거부 · App Store · bundle mismatch · 10. 06. 18:00',
    );
  });

  it('같은 종류·같은 스토어는 10분 창에 한 번만 — 창이 지나면 억제된 건수를 덧붙여 다시 보낸다', () => {
    const { service, slack } = build();

    service.receiptRejected(SubscriptionStore.PLAY_STORE, 'unknown token', NOW);
    service.receiptRejected(
      SubscriptionStore.PLAY_STORE,
      'unknown token',
      new Date(NOW.getTime() + 60_000),
    );
    service.receiptRejected(
      SubscriptionStore.PLAY_STORE,
      'unknown token',
      new Date(NOW.getTime() + 120_000),
    );
    expect(slack.notify).toHaveBeenCalledTimes(1);

    service.receiptRejected(
      SubscriptionStore.PLAY_STORE,
      'unknown token',
      new Date(NOW.getTime() + BILLING_ALERT_WINDOW_MS + 1),
    );
    expect(slack.notify).toHaveBeenCalledTimes(2);
    expect(slack.notify.mock.calls[1][1]).toContain('직전 10분 2건 더 있었음');
  });

  it('종류·스토어가 다르면 창을 따로 센다', () => {
    const { service, slack } = build();

    service.receiptRejected(SubscriptionStore.APP_STORE, 'a', NOW);
    service.receiptRejected(SubscriptionStore.PLAY_STORE, 'b', NOW);
    service.notificationRejected(
      SubscriptionStore.APP_STORE,
      'invalid',
      'sig',
      NOW,
    );
    service.reconcileFailed('04:45 작업 중단 — boom', NOW);

    expect(slack.notify).toHaveBeenCalledTimes(4);
    expect(slack.notify.mock.calls[2][1]).toContain(
      '스토어 알림 거부 · App Store · invalid: sig',
    );
    expect(slack.notify.mock.calls[3][1]).toContain(
      '구독 보정 실패 · 04:45 작업 중단',
    );
  });
});
