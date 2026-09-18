import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PushReceiptService } from './services/push-receipt.service';

/**
 * 발송 receipt 확인 주기. Expo는 발송 후 약 15분 뒤 receipt를 조회하라고 권하고 24시간만 보관한다 —
 * 10분마다 돌면 대기 시간이 지난 것을 늦어도 25분 안에 확인한다. 대기 목록이 비면 아무 요청도 없다.
 *
 * 던지지 않는다 — 던지면 스케줄러가 멈춘다. 실패분은 목록에 남아 다음 주기에 다시 묻는다.
 */
@Injectable()
export class PushReceiptScheduler {
  private readonly logger = new Logger(PushReceiptScheduler.name);

  constructor(private readonly pushReceiptService: PushReceiptService) {}

  @Cron('0 */10 * * * *', {
    name: 'push-receipt-check',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    try {
      await this.pushReceiptService.checkDue(new Date());
    } catch (error) {
      this.logger.error(
        'push receipt check failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
