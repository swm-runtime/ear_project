import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InviteCodeRedemption } from './entities/invite-code-redemption.entity';
import { InviteCode } from './entities/invite-code.entity';
import { Plan } from './entities/plan.entity';
import { PurchaseIntent } from './entities/purchase-intent.entity';
import { StoreNotificationLog } from './entities/store-notification-log.entity';
import { Subscription } from './entities/subscription.entity';
import { InviteCodeRepository } from './repositories/invite-code.repository';
import { PlanRepository } from './repositories/plan.repository';
import { PurchaseIntentRepository } from './repositories/purchase-intent.repository';
import { StoreNotificationLogRepository } from './repositories/store-notification-log.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InviteCodeService } from './services/invite-code.service';
import { PlanService } from './services/plan.service';
import { PurchaseIntentService } from './services/purchase-intent.service';
import { SeriesPaywallService } from './services/series-paywall.service';
import { StoreNotificationLogService } from './services/store-notification-log.service';
import { SubscriptionService } from './services/subscription.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      Plan,
      PurchaseIntent,
      StoreNotificationLog,
      InviteCode,
      InviteCodeRedemption,
    ]),
  ],
  providers: [
    SubscriptionRepository,
    PlanRepository,
    PurchaseIntentRepository,
    StoreNotificationLogRepository,
    InviteCodeRepository,
    SubscriptionService,
    PlanService,
    PurchaseIntentService,
    StoreNotificationLogService,
    InviteCodeService,
    SeriesPaywallService,
  ],
  exports: [
    SubscriptionService,
    PlanService,
    PurchaseIntentService,
    StoreNotificationLogService,
    InviteCodeService,
    // 시리즈 유료화(KAN-290) — 재생 게이트(playback)·드립 편성(drip-batch)·리텐션 알림(retention-push)이 같은 판정을 쓴다
    SeriesPaywallService,
  ],
})
export class SubscriptionModule {}
