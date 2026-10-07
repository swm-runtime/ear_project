import { Module } from '@nestjs/common';

import { SentryWebhookController } from './sentry-webhook.controller';
import { SentryWebhookService } from './sentry-webhook.service';
import { SlackAlertService } from './slack-alert.service';

/**
 * 팀 알림 채널 — 어느 도메인에도 속하지 않는 통로라 따로 둔다. 다른 모듈은 `SlackAlertService` 만 쓴다.
 * Sentry → Slack 릴레이(`webhooks/sentry`)도 알림 통로의 일부라 여기 둔다(2026-10-07).
 */
@Module({
  controllers: [SentryWebhookController],
  providers: [SlackAlertService, SentryWebhookService],
  exports: [SlackAlertService],
})
export class AlertModule {}
