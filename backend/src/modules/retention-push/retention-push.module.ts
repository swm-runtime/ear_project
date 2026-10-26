import { Module } from '@nestjs/common';

import { NotificationModule } from '@/modules/notification/notification.module';

import { RetentionPushRepository } from './retention-push.repository';
import { RetentionPushScheduler } from './retention-push.scheduler';
import { RetentionPushService } from './retention-push.service';

/**
 * 저녁 리텐션 알림(`notification.md` 4.6, KAN-272). 소유한 표가 없다 — 판정에 쓰는 사실은 읽기 전용 집계로 읽고,
 * 발송·기록은 `notification`이 맡는다(`notification_logs.type = retention.<규칙>.<변형>`).
 */
@Module({
  imports: [NotificationModule],
  providers: [
    RetentionPushRepository,
    RetentionPushService,
    RetentionPushScheduler,
  ],
  exports: [RetentionPushService],
})
export class RetentionPushModule {}
