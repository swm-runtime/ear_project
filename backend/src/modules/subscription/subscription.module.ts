import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { PlanRepository } from './repositories/plan.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { PlanService } from './services/plan.service';
import { SubscriptionService } from './services/subscription.service';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Plan])],
  providers: [
    SubscriptionRepository,
    PlanRepository,
    SubscriptionService,
    PlanService,
  ],
  exports: [SubscriptionService, PlanService],
})
export class SubscriptionModule {}
