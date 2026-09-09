import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { IDEMPOTENCY_PURGE_INTERVAL_MS } from './idempotency.constant';
import { IdempotencyService } from './idempotency.service';

/**
 * 만료된 멱등키를 지운다 — **`expires_at`을 실제로 집행하는 유일한 경로다.**
 *
 * 이 스케줄러가 없으면 `expires_at`은 **같은 키가 다시 들어올 때만** 게으르게 확인된다
 * (`IdempotencyService.begin`). 클라이언트가 호출마다 새 키를 만드는 엔드포인트에서는
 * 그 재방문이 영영 일어나지 않으므로, `domain.md` 1.4가 개인정보보호법 제21조 제1항을
 * 근거로 정한 **24시간 보존이 사실상 무기한이 된다.**
 *
 * 행에는 응답 본문이 그대로 들어 있다 — 이메일·닉네임 같은 개인정보가 섞이는 자리다.
 * 그래서 이것은 청소 작업이 아니라 **파기 의무의 이행 경로**다.
 *
 * 다중 인스턴스가 동시에 돌아도 안전하다. 같은 조건의 DELETE라 겹치면 지울 것이 없을 뿐이다.
 */
@Injectable()
export class IdempotencyPurgeScheduler {
  private readonly logger = new Logger(IdempotencyPurgeScheduler.name);

  constructor(private readonly idempotencyService: IdempotencyService) {}

  @Interval('idempotency-purge', IDEMPOTENCY_PURGE_INTERVAL_MS)
  async purgeExpired(): Promise<void> {
    try {
      const deletedCount = await this.idempotencyService.purgeExpired(
        new Date(),
      );

      if (deletedCount > 0) {
        this.logger.log('expired idempotency keys purged', {
          deleted_count: deletedCount,
        });
      }
    } catch (error) {
      // 실패해도 다음 주기가 다시 시도한다 — 던지면 스케줄러가 멈춘다
      this.logger.error(
        'failed to purge expired idempotency keys',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
