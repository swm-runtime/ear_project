import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import {
  RECONCILE_FORCE_EXPIRE_MS,
  RECONCILE_OVERDUE_MS,
} from '@/modules/subscription/subscription.constant';
import {
  NON_TERMINAL_SUBSCRIPTION_STATUSES,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';

import { AppStoreGateway } from '../app-store/app-store.gateway';
import { RECONCILE_BATCH_SIZE } from '../billing.constant';
import { BillingSyncService, SyncOutcome } from './billing-sync.service';
import { PlayPurchaseService } from './play-purchase.service';
import { BillingAlertService } from './billing-alert.service';

/** 한 건의 보정 결과 — `unverifiable`은 스토어의 답을 얻지 못했거나 그 답을 반영할 수 없었다는 뜻이다 */
type ReconcileResult = 'applied' | 'settled' | 'unverifiable';

/**
 * 만료 보정(`subscription-api.md` 4.2 · `subscription.md` 7) — **스토어 알림이 유실됐을 때의 안전망**이다.
 *
 * 정상이라면 갱신·만료·환불은 스토어 서버 알림으로 들어온다. 알림이 안 오면 행이 "만료일이 지났는데
 * 아직 유효"로 남는다 — 그때 스토어에 그 구독의 현재 상태를 직접 물어 맞춘다.
 *
 * **섣불리 추측으로 강등하지 않는다.** 스토어에 물을 수 없거나(키 미구성) 조회가 실패하면 저장된 상태를 그대로
 * 둔다 — 만료일이 지났다는 사실만으로 무료로 내리면, 갱신 알림이 늦었을 뿐인 결제 사용자가 막힌다.
 * **다만 상한이 있다**(`RECONCILE_FORCE_EXPIRE_MS`, 2026-10-06): 확인할 수 없는 채로 만료일이 7일을 넘기면
 * 만료로 내린다. 상한이 없으면 그런 행은 영영 유료이고, 매 배치의 앞자리를 차지해 다른 행의 보정을 민다.
 */
@Injectable()
export class SubscriptionReconcileService {
  private readonly logger = new Logger(SubscriptionReconcileService.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billingSyncService: BillingSyncService,
    private readonly appStoreGateway: AppStoreGateway,
    private readonly playPurchaseService: PlayPurchaseService,
    private readonly dataSource: DataSource,
    private readonly billingAlertService: BillingAlertService,
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
    const result =
      subscription.store === SubscriptionStore.PLAY_STORE
        ? await this.reconcilePlay(subscription, now)
        : await this.reconcileAppStore(subscription, now);

    if (result !== 'unverifiable') {
      return result === 'applied';
    }

    return this.expireIfPastLimit(subscription, now);
  }

  /**
   * 확인할 수 없는 구독의 상한. 만료일이 상한을 넘겼으면 만료로 내리고 `true`. 실패해도 던지지 않는다 —
   * 조회 경로(4.2)가 이 때문에 막히면 안 된다.
   */
  private async expireIfPastLimit(
    subscription: Subscription,
    now: Date,
  ): Promise<boolean> {
    const limit = new Date(now.getTime() - RECONCILE_FORCE_EXPIRE_MS);

    if (subscription.expiresAt.getTime() >= limit.getTime()) {
      return false;
    }

    try {
      const expired = await this.dataSource.transaction((manager) =>
        this.billingSyncService.expireUnverifiable(
          subscription.originalTransactionId,
          limit,
          manager,
        ),
      );

      if (expired) {
        // 스토어의 답 없이 내린 것이다 — 드물어야 하고, 잦으면 조회 구성(키·환경)이 빠진 것이다
        this.logger.warn('overdue subscription expired without store answer', {
          subscription_id: subscription.id,
          user_id: subscription.userId,
          store: subscription.store,
          environment: subscription.environment,
          expires_at: subscription.expiresAt.toISOString(),
        });
      }

      return expired;
    } catch (error) {
      this.logger.warn('overdue subscription force-expire failed', {
        subscription_id: subscription.id,
        reason: error instanceof Error ? error.message : String(error),
      });

      return false;
    }
  }

  private async reconcileAppStore(
    subscription: Subscription,
    now: Date,
  ): Promise<ReconcileResult> {
    if (!this.appStoreGateway.canFetchStatus(subscription.environment)) {
      this.logger.warn('overdue subscription left as is: store not queryable', {
        subscription_id: subscription.id,
        store: subscription.store,
        environment: subscription.environment,
      });

      return 'unverifiable';
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

        return 'unverifiable';
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

      return toResult(outcome);
    } catch (error) {
      this.logger.warn('overdue subscription reconcile failed', {
        subscription_id: subscription.id,
        reason: error instanceof Error ? error.message : String(error),
      });

      this.billingAlertService.reconcileFailed(
        `${subscription.store} 구독 1건 — ${error instanceof Error ? error.message : String(error)}`,
      );

      return 'unverifiable';
    }
  }

  /**
   * Play 구독의 보정 — 마지막 구매 토큰으로 Google에 현재 상태를 묻는다. Play는 서비스 계정 하나로 실결제·시험
   * 구매를 다 조회하므로 환경을 가리지 않는다.
   */
  private async reconcilePlay(
    subscription: Subscription,
    now: Date,
  ): Promise<ReconcileResult> {
    if (!this.playPurchaseService.isEnabled()) {
      this.logger.warn('overdue subscription left as is: store not queryable', {
        subscription_id: subscription.id,
        store: subscription.store,
        environment: subscription.environment,
      });

      return 'unverifiable';
    }

    try {
      const outcome = await this.playPurchaseService.reconcile(
        subscription,
        now,
      );

      if (outcome === null) {
        this.logger.warn('overdue subscription unknown to the store', {
          subscription_id: subscription.id,
        });

        return 'unverifiable';
      }

      this.logger.log('overdue subscription reconciled', {
        subscription_id: subscription.id,
        store: subscription.store,
        outcome: outcome.kind,
      });

      return toResult(outcome);
    } catch (error) {
      this.logger.warn('overdue subscription reconcile failed', {
        subscription_id: subscription.id,
        reason: error instanceof Error ? error.message : String(error),
      });

      this.billingAlertService.reconcileFailed(
        `${subscription.store} 구독 1건 — ${error instanceof Error ? error.message : String(error)}`,
      );

      return 'unverifiable';
    }
  }
}

/** 스토어가 답했어도 그 답을 반영하지 못했으면(모르는 상품 등) 확인하지 못한 것이다 — 상한의 대상이다 */
function toResult(outcome: SyncOutcome): ReconcileResult {
  switch (outcome.kind) {
    case 'applied':
      return 'applied';
    case 'unchanged':
      return 'settled';
    case 'ignored':
    case 'unlinked':
      return 'unverifiable';
  }
}

function isOverdue(subscription: Subscription, now: Date): boolean {
  return (
    NON_TERMINAL_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
    subscription.expiresAt.getTime() < now.getTime() - RECONCILE_OVERDUE_MS
  );
}
