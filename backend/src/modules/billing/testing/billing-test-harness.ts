import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { SlackAlertService } from '@/modules/alert/slack-alert.service';

import { BillingOrchestrator } from '../billing.orchestrator';
import { AppStoreWebhookService } from '../services/app-store-webhook.service';
import { BillingAlertService } from '../services/billing-alert.service';
import { BillingEventAlertService } from '../services/billing-event-alert.service';
import { BillingSyncService } from '../services/billing-sync.service';
import { PlanDiscountService } from '../services/plan-discount.service';
import { PlayPurchaseService } from '../services/play-purchase.service';
import { PlayStoreWebhookService } from '../services/play-store-webhook.service';
import { SubscriptionReconcileService } from '../services/subscription-reconcile.service';
import { BillingTestWorld } from './billing-test-world';

/**
 * 결제 유스케이스를 **실제 클래스 그대로** 조립한다 — 가짜는 `BillingTestWorld`가 가진 저장소와 두 스토어뿐이다.
 * App Store·Play 테스트가 같은 조립을 쓰도록 한곳에 둔다(생성자 인자가 바뀔 때 고칠 곳이 하나다).
 */
export function assembleBilling(
  world = new BillingTestWorld(),
  /** 서버 설정(env) — 지금은 할인 표시 키(`PLAN_DISCOUNT_*`)만 읽는다. 비우면 전부 꺼진 운영 기본값이다 */
  env: Record<string, string> = {},
) {
  // Slack 은 보내지 않고 문구만 모은다 — 테스트가 "알렸는가"를 본다
  const slackTexts: string[] = [];
  const alerts = new BillingAlertService({
    enabled: true,
    notify: (_kind: string, text: string) => {
      slackTexts.push(text);
    },
  } as unknown as SlackAlertService);
  // 결제 알림(성공 쪽)은 따로 모은다 — 실패 알림을 세는 기존 단언(`slackTexts`)이 결제 한 건으로 흔들리지 않게
  const paymentTexts: string[] = [];
  const paymentAlerts = new BillingEventAlertService(
    {
      enabled: true,
      notify: (_kind: string, text: string) => {
        paymentTexts.push(text);
      },
    } as unknown as SlackAlertService,
    world.userService,
  );
  const sync = new BillingSyncService(
    world.subscriptionService,
    world.planService,
    world.purchaseIntentService,
    world.userService,
    world.inviteCodeService,
  );
  const playPurchase = new PlayPurchaseService(
    world.playGateway,
    world.planService,
    sync,
    world.dataSource,
    alerts,
    paymentAlerts,
  );
  const reconcile = new SubscriptionReconcileService(
    world.subscriptionService,
    sync,
    world.gateway,
    playPurchase,
    world.dataSource,
    alerts,
  );
  const orchestrator = new BillingOrchestrator(
    world.planService,
    world.subscriptionService,
    world.purchaseIntentService,
    world.userService,
    sync,
    reconcile,
    world.gateway,
    playPurchase,
    world.dataSource,
    alerts,
    world.inviteCodeService,
    paymentAlerts,
    new PlanDiscountService({
      get: (key: string) => env[key],
    } as unknown as ConfigService<EnvironmentVariables, true>),
  );
  const appStoreWebhook = new AppStoreWebhookService(
    world.gateway,
    world.storeNotificationLogService,
    sync,
    world.dataSource,
    alerts,
    paymentAlerts,
  );
  const playStoreWebhook = new PlayStoreWebhookService(
    world.playGateway,
    playPurchase,
    world.storeNotificationLogService,
    alerts,
  );

  return {
    world,
    slackTexts,
    paymentTexts,
    sync,
    orchestrator,
    reconcile,
    appStoreWebhook,
    playStoreWebhook,
  };
}
