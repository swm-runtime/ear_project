import { Module } from '@nestjs/common';

import { SlackAlertService } from './slack-alert.service';

/** 팀 알림 채널 — 어느 도메인에도 속하지 않는 통로라 따로 둔다. 다른 모듈은 `SlackAlertService` 만 쓴다 */
@Module({
  providers: [SlackAlertService],
  exports: [SlackAlertService],
})
export class AlertModule {}
