import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PurchaseIntentService } from '@/modules/subscription/services/purchase-intent.service';

import { SubscriptionReconcileService } from './subscription-reconcile.service';

/**
 * 구독의 하루 1회 정리(`subscription-api.md` 4.2 · 4.3).
 *
 * 1. **만료 보정** — 만료일이 지났는데 유효로 남은 구독을 스토어 상태로 맞춘다. 조회 때도 같은 보정을 하지만,
 *    앱을 열지 않는 사용자의 행은 이 배치만 본다(유료 티어가 남아 드립·한도가 계속 유료로 돈다).
 * 2. **버려진 결제 의도 정리** — 결제 시트를 닫아 `created`로 남은 행을 30일 뒤 지운다(domain.md 8.3).
 *
 * 04:45 KST — 04:30 보존 삭제 뒤, 05:00 드립 편성 앞이다(`backend-monitoring.md` 3-2). 편성이 돌기 전에
 * 티어를 확정해 둔다. 다중 인스턴스가 함께 돌아도 안전하다: 보정은 행을 잠그고 같은 스토어 답으로 같은 상태를
 * 쓰며, 정리는 같은 조건의 DELETE다.
 */
@Injectable()
export class SubscriptionReconcileScheduler {
  private readonly logger = new Logger(SubscriptionReconcileScheduler.name);

  constructor(
    private readonly subscriptionReconcileService: SubscriptionReconcileService,
    private readonly purchaseIntentService: PurchaseIntentService,
  ) {}

  @Cron('0 45 4 * * *', {
    name: 'subscription-reconcile',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    const now = new Date();

    try {
      const reconciled =
        await this.subscriptionReconcileService.reconcileOverdue(now);
      const purged = await this.purchaseIntentService.purgeAbandoned(now);

      if (reconciled > 0 || purged > 0) {
        this.logger.log('subscription daily maintenance done', {
          reconciled_count: reconciled,
          purged_intent_count: purged,
        });
      }
    } catch (error) {
      // 실패해도 내일 다시 돈다 — 던지면 스케줄러가 멈춘다
      this.logger.error(
        'subscription daily maintenance failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
