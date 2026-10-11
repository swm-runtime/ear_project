import { Module } from '@nestjs/common';

import { AlertModule } from '@/modules/alert/alert.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';
import { UserModule } from '@/modules/user/user.module';

import { AppStoreGateway } from './app-store/app-store.gateway';
import { AppleAppStoreGateway } from './app-store/apple-app-store.gateway';
import { BillingOrchestrator } from './billing.orchestrator';
import { AppStoreWebhookController } from './controllers/app-store-webhook.controller';
import { PlayStoreWebhookController } from './controllers/play-store-webhook.controller';
import { PlanController } from './controllers/plan.controller';
import { SubscriptionController } from './controllers/subscription.controller';
import { AppStoreWebhookService } from './services/app-store-webhook.service';
import { BillingAlertService } from './services/billing-alert.service';
import { BillingSyncService } from './services/billing-sync.service';
import { InviteGrantExpiryScheduler } from './services/invite-grant-expiry.scheduler';
import { InviteGrantExpiryService } from './services/invite-grant-expiry.service';
import { PlayPurchaseService } from './services/play-purchase.service';
import { PlayStoreWebhookService } from './services/play-store-webhook.service';
import { GooglePlayStoreGateway } from './play-store/google-play-store.gateway';
import { PlayStoreGateway } from './play-store/play-store.gateway';
import { SubscriptionReconcileScheduler } from './services/subscription-reconcile.scheduler';
import { SubscriptionReconcileService } from './services/subscription-reconcile.service';

/**
 * 구독·인앱 결제 유스케이스(`subscription-api.md` — KAN-106 · KAN-40).
 *
 * **테이블을 소유하지 않는다.** `plans`·`subscriptions`·`purchase_intents`·`store_notification_logs`는
 * `subscription` 모듈이, `users`는 `user` 모듈이 소유하고 여기는 그 Service들을 엮는다.
 *
 * 따로 모듈인 이유: `user`가 `subscription`을 의존한다(탈퇴 시 결제 이력 판정). 결제 반영은 구독 행과
 * `users.tier`를 한 트랜잭션에서 고쳐야 하는데 `subscription`은 `user`를 의존할 수 없으므로,
 * 둘 위에 선 이 모듈이 그 반영을 맡는다(architecture.md 4.3).
 */
@Module({
  imports: [SubscriptionModule, UserModule, AlertModule],
  controllers: [
    PlanController,
    SubscriptionController,
    AppStoreWebhookController,
    PlayStoreWebhookController,
  ],
  providers: [
    BillingAlertService,
    BillingOrchestrator,
    BillingSyncService,
    SubscriptionReconcileService,
    SubscriptionReconcileScheduler,
    InviteGrantExpiryService,
    InviteGrantExpiryScheduler,
    AppStoreWebhookService,
    { provide: AppStoreGateway, useClass: AppleAppStoreGateway },
    PlayPurchaseService,
    PlayStoreWebhookService,
    { provide: PlayStoreGateway, useClass: GooglePlayStoreGateway },
  ],
})
export class BillingModule {}
