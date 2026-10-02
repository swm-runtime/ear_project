import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import { RECONCILE_OVERDUE_MS } from '@/modules/subscription/subscription.constant';
import {
  NON_TERMINAL_SUBSCRIPTION_STATUSES,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';

import { AppStoreGateway } from '../app-store/app-store.gateway';
import { RECONCILE_BATCH_SIZE } from '../billing.constant';
import { BillingSyncService } from './billing-sync.service';

/**
 * 만료 보정(`subscription-api.md` 4.2 · `subscription.md` 7) — **스토어 알림이 유실됐을 때의 안전망**이다.
 *
 * 정상이라면 갱신·만료·환불은 스토어 서버 알림으로 들어온다. 알림이 안 오면 행이 "만료일이 지났는데
 * 아직 유효"로 남는다 — 그때 스토어에 그 구독의 현재 상태를 직접 물어 맞춘다.
 *
 * **추측으로 강등하지 않는다.** 스토어에 물을 수 없거나(키 미구성) 조회가 실패하면 저장된 상태를 그대로 둔다.
 * 만료일이 지났다는 사실만으로 무료로 내리면, 갱신 알림이 늦었을 뿐인 결제 사용자가 막힌다.
 */
@Injectable()
export class SubscriptionReconcileService {
  private readonly logger = new Logger(SubscriptionReconcileService.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billingSyncService: BillingSyncService,
    private readonly appStoreGateway: AppStoreGateway,
    private readonly dataSource: DataSource,
  ) {}

  /** 조회 경로용 — 그 사용자의 현재 구독이 보정 대상이면 맞춘다. 실패해도 던지지 않는다 */
  async reconcileUser(userId: string, now: Date): Promise<void> {
    const current = await this.subscriptionService.findCurrent(userId);

    if (current === null || !isOverdue(current, now)) {
      return;
    }

    await this.reconcile(current, now);
  }

  /** 배치용 — 보정 대상 전부. 맞춘 건수를 돌려준다 */
  async reconcileOverdue(now: Date): Promise<number> {
    const overdue = await this.subscriptionService.findOverdue(
      new Date(now.getTime() - RECONCILE_OVERDUE_MS),
      RECONCILE_BATCH_SIZE,
    );
    let reconciled = 0;

    for (const subscription of overdue) {
      if (await this.reconcile(subscription, now)) {
        reconciled += 1;
      }
    }

    return reconciled;
  }

  /** 한 건을 스토어 상태로 맞춘다. 상태가 바뀌었으면 `true` */
  private async reconcile(
    subscription: Subscription,
    now: Date,
  ): Promise<boolean> {
    // Play는 아직 구현 전이다(`subscription-api.md` 1장) — 그 행은 건드리지 않는다
    if (
      subscription.store !== SubscriptionStore.APP_STORE ||
      !this.appStoreGateway.canFetchStatus(subscription.environment)
    ) {
      this.logger.warn('overdue subscription left as is: store not queryable', {
        subscription_id: subscription.id,
        store: subscription.store,
        environment: subscription.environment,
      });

      return false;
    }

    try {
      // 스토어 조회는 트랜잭션 밖에서 한다 — 네트워크를 기다리는 동안 행을 잠가 두지 않는다
      const status = await this.appStoreGateway.fetchStatus(
        subscription.originalTransactionId,
        subscription.environment,
      );

      if (status === null) {
        this.logger.warn('overdue subscription unknown to the store', {
          subscription_id: subscription.id,
        });

        return false;
      }

      const outcome = await this.dataSource.transaction(async (manager) => {
        const result = await this.billingSyncService.applyStoreStatus(
          subscription,
          { ...status, checkedAt: now },
          manager,
        );

        await this.billingSyncService.syncUserTier(
          subscription.userId,
          manager,
        );

        return result;
      });

      this.logger.log('overdue subscription reconciled', {
        subscription_id: subscription.id,
        store_status: status.status,
        outcome: outcome.kind,
      });

      return outcome.kind === 'applied';
    } catch (error) {
      this.logger.warn('overdue subscription reconcile failed', {
        subscription_id: subscription.id,
        reason: error instanceof Error ? error.message : String(error),
      });

      return false;
    }
  }
}

function isOverdue(subscription: Subscription, now: Date): boolean {
  return (
    NON_TERMINAL_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
    subscription.expiresAt.getTime() < now.getTime() - RECONCILE_OVERDUE_MS
  );
}
