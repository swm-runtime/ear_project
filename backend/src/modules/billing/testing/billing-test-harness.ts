import { BillingOrchestrator } from '../billing.orchestrator';
import { AppStoreWebhookService } from '../services/app-store-webhook.service';
import { BillingSyncService } from '../services/billing-sync.service';
import { PlayPurchaseService } from '../services/play-purchase.service';
import { PlayStoreWebhookService } from '../services/play-store-webhook.service';
import { SubscriptionReconcileService } from '../services/subscription-reconcile.service';
import { BillingTestWorld } from './billing-test-world';

/**
 * 결제 유스케이스를 **실제 클래스 그대로** 조립한다 — 가짜는 `BillingTestWorld`가 가진 저장소와 두 스토어뿐이다.
 * App Store·Play 테스트가 같은 조립을 쓰도록 한곳에 둔다(생성자 인자가 바뀔 때 고칠 곳이 하나다).
 */
export function assembleBilling(world = new BillingTestWorld()) {
  const sync = new BillingSyncService(
    world.subscriptionService,
    world.planService,
    world.purchaseIntentService,
    world.userService,
  );
  const playPurchase = new PlayPurchaseService(
    world.playGateway,
    world.planService,
    sync,
    world.dataSource,
  );
  const reconcile = new SubscriptionReconcileService(
    world.subscriptionService,
    sync,
    world.gateway,
    playPurchase,
    world.dataSource,
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
  );
  const appStoreWebhook = new AppStoreWebhookService(
    world.gateway,
    world.storeNotificationLogService,
    sync,
    world.dataSource,
  );
  const playStoreWebhook = new PlayStoreWebhookService(
    world.playGateway,
    playPurchase,
    world.storeNotificationLogService,
  );

  return {
    world,
    sync,
    orchestrator,
    reconcile,
    appStoreWebhook,
    playStoreWebhook,
  };
}
