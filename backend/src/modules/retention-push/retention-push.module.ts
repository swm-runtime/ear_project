import { Module } from '@nestjs/common';

import { ContentModule } from '@/modules/content/content.module';
import { NotificationModule } from '@/modules/notification/notification.module';
import { SubscriptionModule } from '@/modules/subscription/subscription.module';

import { MorningPushService } from './morning-push.service';
import { RetentionPushRepository } from './retention-push.repository';
import { RetentionPushScheduler } from './retention-push.scheduler';
import { RetentionPushService } from './retention-push.service';

/**
 * 저녁 리텐션 알림(`notification.md` 4.6, KAN-272)과 아침 알림(KAN-288 — 드립이 없는 날 08:00, 크론은 `drip-batch`의 도착 알림 크론). 소유한 표가 없다 — 판정에 쓰는 사실은 읽기 전용 집계로 읽고,
 * 발송·기록은 `notification`이 맡는다(`notification_logs.type = retention.<규칙>.<변형>`).
 */
@Module({
  // ContentModule — 짧은 판 코호트 경계(`ContentCohortService`, KAN-298)만 쓴다
  // SubscriptionModule — 시리즈 유료화(`SeriesPaywallService`, KAN-290) 판정만 쓴다. subscription 은 다른 모듈을 import 하지 않아 순환이 없다
  imports: [NotificationModule, ContentModule, SubscriptionModule],
  providers: [
    RetentionPushRepository,
    RetentionPushService,
    RetentionPushScheduler,
    MorningPushService,
  ],
  // MorningPushService — 아침 알림(KAN-288)은 드립 도착 크론(08:00) 안에서 부른다(`drip-batch`가 의존)
  exports: [RetentionPushService, MorningPushService],
})
export class RetentionPushModule {}
