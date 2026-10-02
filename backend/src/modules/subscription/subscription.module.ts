import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Plan } from './entities/plan.entity';
import { PurchaseIntent } from './entities/purchase-intent.entity';
import { StoreNotificationLog } from './entities/store-notification-log.entity';
import { Subscription } from './entities/subscription.entity';
import { PlanRepository } from './repositories/plan.repository';
import { PurchaseIntentRepository } from './repositories/purchase-intent.repository';
import { StoreNotificationLogRepository } from './repositories/store-notification-log.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { PlanService } from './services/plan.service';
import { PurchaseIntentService } from './services/purchase-intent.service';
import { StoreNotificationLogService } from './services/store-notification-log.service';
import { SubscriptionService } from './services/subscription.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      Plan,
      PurchaseIntent,
      StoreNotificationLog,
    ]),
  ],
  providers: [
    SubscriptionRepository,
    PlanRepository,
    PurchaseIntentRepository,
    StoreNotificationLogRepository,
    SubscriptionService,
    PlanService,
    PurchaseIntentService,
    StoreNotificationLogService,
  ],
  exports: [
    SubscriptionService,
    PlanService,
    PurchaseIntentService,
    StoreNotificationLogService,
  ],
})
export class SubscriptionModule {}
