import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  EnvironmentVariables,
  NodeEnv,
  PushDelivery,
} from '@/config/env.validation';
import { UserModule } from '@/modules/user/user.module';

import { NotificationLog } from './entities/notification-log.entity';
import { ExpoPushClient } from './push/expo-push.client';
import { LogPushClient } from './push/log-push.client';
import { PushClient } from './push/push.client';
import { PushReceiptScheduler } from './push-receipt.scheduler';
import { NotificationLogRepository } from './repositories/notification-log.repository';
import { DripArrivalNotificationService } from './services/drip-arrival-notification.service';
import { PushReceiptService } from './services/push-receipt.service';

/**
 * domain.md 2장 — `notification_logs` 소유. 의존은 `user` 하나다(기기 토큰·알림 토글).
 *
 * 무엇을 보낼지(적립분)는 편성 배치가 넘기고, **누구에게 보낼지는 여기서 판정한다**(`notification.md` 4.2).
 * 발송 수단은 `PUSH_DELIVERY`가 고른다 — 기본 `log`는 보내지 않는다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationLog]), UserModule],
  providers: [
    NotificationLogRepository,
    DripArrivalNotificationService,
    PushReceiptService,
    PushReceiptScheduler,
    {
      provide: PushClient,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvironmentVariables, true>,
      ): PushClient => {
        if (
          configService.get('PUSH_DELIVERY', { infer: true }) ===
          PushDelivery.EXPO
        ) {
          return new ExpoPushClient(configService);
        }

        // 기본값이 "보내지 않음"이라 운영에서 켜는 것을 잊으면 조용히 sent 만 쌓인다 — 기동 때 한 번 드러낸다
        if (
          configService.get('NODE_ENV', { infer: true }) === NodeEnv.PRODUCTION
        ) {
          new Logger(NotificationModule.name).warn(
            'push delivery is log only, notifications are not sent',
            { push_delivery: PushDelivery.LOG },
          );
        }

        return new LogPushClient();
      },
    },
  ],
  exports: [DripArrivalNotificationService],
})
export class NotificationModule {}
