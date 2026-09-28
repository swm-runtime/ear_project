import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Plan } from './entities/plan.entity';
import { PurchaseIntent } from './entities/purchase-intent.entity';
import { StoreNotificationLog } from './entities/store-notification-log.entity';
import { Subscription } from './entities/subscription.entity';
import { PlanRepository } from './repositories/plan.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { PlanService } from './services/plan.service';
import { SubscriptionService } from './services/subscription.service';

@Module({
  imports: [
    // `PurchaseIntent` · `StoreNotificationLog`는 아직 읽고 쓰는 코드가 없다 — 스키마(domain.md 8.3 · 8.4)만
    // 먼저 두고, 영수증 검증(KAN-40)이 저장소·서비스를 붙인다
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
    SubscriptionService,
    PlanService,
  ],
  exports: [SubscriptionService, PlanService],
})
export class SubscriptionModule {}
