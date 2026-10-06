import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { SubscriptionStore } from '@/modules/subscription/subscription.enum';

import { receiptInvalid, storeUnavailable } from '../billing.exception';
import {
  PlaySnapshot,
  isEntitled,
  toPlaySnapshot,
} from '../play-store/play-purchase.mapper';
import {
  PlayNotification,
  PlayPurchase,
  PlayStoreError,
  PlayStoreGateway,
} from '../play-store/play-store.gateway';
import { BillingSyncService, SyncOutcome } from './billing-sync.service';

/** `subscriptionNotification.notificationType` — 12가 철회(환불)다. 구독 상태만으로는 만료와 구분되지 않는다 */
const NOTIFICATION_TYPE_REVOKED = 12;

/**
 * Google Play 구매의 반영(`subscription-api.md` 4.4·4.5·4.7).
 *
 * App Store와 흐름이 다르다. App Store는 서명된 거래 자체가 사실이지만, **Play의 구매 토큰은 열쇠일 뿐이라
 * 모든 경로가 "Google에 지금 상태를 묻고 그대로 반영"한다** — 영수증 제출도, 복원도, 알림도, 만료 보정도 같다.
 * 그래서 네 경로가 이 서비스의 한 뼈대(`fetch` → `apply`)를 쓴다.
 *
 * 순서가 중요하다: **반영(커밋) → 확인(acknowledge).** 먼저 확인하면 반영이 실패했을 때 "결제됐는데 티어 없음"이
 * 되고, 확인하지 않은 채 3일이 지나면 Google이 자동 환불한다(7장). 확인이 실패하면 재시도 가능한 오류로 답해
 * 다음 시도(클라이언트 재제출·Pub/Sub 재전송)가 다시 확인하게 한다 — 반영은 멱등이라 두 번 해도 같다.
 */
@Injectable()
export class PlayPurchaseService {
  private readonly logger = new Logger(PlayPurchaseService.name);

  constructor(
    private readonly playStoreGateway: PlayStoreGateway,
    private readonly planService: PlanService,
    private readonly billingSyncService: BillingSyncService,
    private readonly dataSource: DataSource,
  ) {}

  isEnabled(): boolean {
    return this.playStoreGateway.isEnabled();
  }

  /** 4.4 — 영수증 제출. 지금 권한을 주는 구매가 아니면 오류다 */
  async submit(
    userId: string,
    purchaseToken: string,
    now: Date,
  ): Promise<void> {
    const purchase = await this.fetchOrInvalid(purchaseToken);

    await this.dataSource.transaction(async (manager) => {
      const snapshot = await this.snapshotOf(purchase, now, manager);

      await this.assertKnownProduct(snapshot);

      // 결제 대기·만료·보류 — 구매 제출인데 지금 유효한 구독이 아니다
      if (!isEntitled(snapshot.status)) {
        throw this.invalid(`not_entitled:${snapshot.status}`);
      }

      const outcome = await this.applyFor(userId, snapshot, now, manager);

      // 환불로 끝난 구매를 같은 토큰으로 다시 낸 것 — Google이 유효라 답해도 되살리지 않는다(4.7)
      if (outcome.kind === 'ignored' && outcome.reason === 'terminated') {
        throw this.invalid('refunded_token');
      }

      await this.billingSyncService.syncUserTier(userId, manager);

      this.logger.log('play purchase applied', {
        user_id: userId,
        product_id: purchase.productId,
        environment: purchase.environment,
        outcome: outcome.kind,
      });
    });

    await this.acknowledgeIfNeeded(purchase);
  }

  /**
   * 4.5 — 복원. 유효한 구매만 연결하고 그 수를 돌려준다. Google이 모르는 토큰이 섞이면 요청 전체가 오류이고
   * (위조로 보인다), 만료·보류된 구매는 무시한다.
   */
  async restore(
    userId: string,
    purchaseTokens: string[],
    now: Date,
  ): Promise<number> {
    // Google 조회는 트랜잭션 밖에서 — 네트워크를 기다리는 동안 행을 잠그지 않는다
    const purchases: PlayPurchase[] = [];

    for (const purchaseToken of [...new Set(purchaseTokens)]) {
      purchases.push(await this.fetchOrInvalid(purchaseToken));
    }

    const applied: PlayPurchase[] = [];

    await this.dataSource.transaction(async (manager) => {
      const snapshots: { purchase: PlayPurchase; snapshot: PlaySnapshot }[] =
        [];

      for (const purchase of purchases) {
        snapshots.push({
          purchase,
          snapshot: await this.snapshotOf(purchase, now, manager),
        });
      }

      // 같은 순서로 잠근다 — 두 복원 요청이 같은 구독들을 엇갈려 잠그면 교착한다
      snapshots.sort((a, b) =>
        a.snapshot.transaction.originalTransactionId.localeCompare(
          b.snapshot.transaction.originalTransactionId,
        ),
      );

      for (const { purchase, snapshot } of snapshots) {
        await this.assertKnownProduct(snapshot);
        // 무시할 구매라도 남의 구독이면 요청 전체를 거부한다(일부만 반영하지 않는다)
        await this.billingSyncService.assertOwnedBy(
          userId,
          snapshot.transaction,
          manager,
        );

        if (!isEntitled(snapshot.status)) {
          continue;
        }

        const outcome = await this.applyFor(userId, snapshot, now, manager);

        // 환불로 끝난 구매(같은 토큰)는 연결된 것이 아니다 — 세지도 확인하지도 않는다(4.7)
        if (outcome.kind === 'ignored') {
          continue;
        }

        applied.push(purchase);
      }

      await this.billingSyncService.syncUserTier(userId, manager);
    });

    for (const purchase of applied) {
      await this.acknowledgeIfNeeded(purchase);
    }

    return applied.length;
  }

  /**
   * 4.7 — 실시간 알림. 알림은 "무슨 일이 있었다"는 신호일 뿐이라, 구매 토큰으로 **현재 상태를 조회해** 반영한다.
   * 구독 행도 계정 토큰도 없어 주인을 모르면 `unlinked`다(이후 영수증 제출·복원이 연결한다).
   */
  async applyNotification(
    notification: PlayNotification,
    now: Date,
  ): Promise<SyncOutcome> {
    if (notification.purchaseToken === null) {
      return { kind: 'ignored', reason: 'unhandled_type' };
    }

    const purchase = await this.fetch(notification.purchaseToken);

    // Google이 그 토큰을 모른다(오래돼 지워졌다) — 반영할 상태가 없다
    if (purchase === null) {
      return { kind: 'ignored', reason: 'no_transaction' };
    }

    const isRevoked =
      notification.kind === 'voided' ||
      notification.type === NOTIFICATION_TYPE_REVOKED;
    let ownerId: string | null = null;

    const outcome = await this.dataSource.transaction(
      async (manager): Promise<SyncOutcome> => {
        const snapshot = await this.snapshotOf(purchase, now, manager, {
          isRevoked,
        });

        if (snapshot.status === 'pending') {
          return { kind: 'ignored', reason: 'unhandled_type' };
        }

        ownerId =
          (await this.billingSyncService.findSubscriptionOwner(
            snapshot.transaction.originalTransactionId,
            manager,
          )) ??
          (await this.billingSyncService.findAccountTokenOwner(
            snapshot.transaction.accountToken,
            manager,
          ));

        if (ownerId === null) {
          return { kind: 'unlinked' };
        }

        const result = await this.billingSyncService.applyStoreSnapshot(
          ownerId,
          { ...snapshot, status: snapshot.status, checkedAt: now },
          manager,
          { createIfMissing: true },
        );

        await this.billingSyncService.syncUserTier(ownerId, manager);

        return result;
      },
    );

    // 주인을 찾아 반영한 구매만 확인한다 — 주인 없는 구매를 확인하면 "결제됐는데 아무 계정에도 없음"이 굳는다
    if (ownerId !== null) {
      await this.acknowledgeIfNeeded(purchase);
    }

    return outcome;
  }

  /** 만료 보정 — 그 구독의 마지막 구매 토큰으로 현재 상태를 물어 맞춘다. Google이 모르면 `null` */
  async reconcile(
    subscription: Subscription,
    now: Date,
  ): Promise<SyncOutcome | null> {
    const purchase = await this.fetch(subscription.latestReceipt);

    if (purchase === null) {
      return null;
    }

    return this.dataSource.transaction(async (manager) => {
      const snapshot = toPlaySnapshot(
        purchase,
        subscription.originalTransactionId,
        now,
      );

      if (snapshot.status === 'pending') {
        return { kind: 'ignored', reason: 'unhandled_type' };
      }

      const outcome = await this.billingSyncService.applyStoreSnapshot(
        subscription.userId,
        { ...snapshot, status: snapshot.status, checkedAt: now },
        manager,
        { createIfMissing: false },
      );

      await this.billingSyncService.syncUserTier(subscription.userId, manager);

      return outcome;
    });
  }

  private async applyFor(
    userId: string,
    snapshot: PlaySnapshot,
    now: Date,
    manager: EntityManager,
  ): Promise<SyncOutcome> {
    if (snapshot.status === 'pending') {
      return { kind: 'ignored', reason: 'unhandled_type' };
    }

    await this.billingSyncService.assertOwnedBy(
      userId,
      snapshot.transaction,
      manager,
    );

    return this.billingSyncService.applyStoreSnapshot(
      userId,
      { ...snapshot, status: snapshot.status, checkedAt: now },
      manager,
      { createIfMissing: true },
    );
  }

  /** 구매가 어느 구독 행의 것인지 정하고(토큰 사슬) 우리 의미로 환산한다 */
  private async snapshotOf(
    purchase: PlayPurchase,
    now: Date,
    manager: EntityManager,
    options: { isRevoked?: boolean } = {},
  ): Promise<PlaySnapshot> {
    const originalTransactionId =
      await this.billingSyncService.resolvePlayOriginalId(
        purchase.purchaseToken,
        purchase.linkedPurchaseToken,
        manager,
      );

    return toPlaySnapshot(purchase, originalTransactionId, now, options);
  }

  /** 구매의 상품이 우리 요금제인가 — **클라이언트가 보낸 상품 ID가 아니라 Google이 답한 값**으로 본다 */
  private async assertKnownProduct(snapshot: PlaySnapshot): Promise<void> {
    const plan = await this.planService.findByStoreProductId(
      SubscriptionStore.PLAY_STORE,
      snapshot.transaction.productId,
    );

    if (plan === null) {
      throw this.invalid('unknown_product');
    }
  }

  private async fetchOrInvalid(purchaseToken: string): Promise<PlayPurchase> {
    const purchase = await this.fetch(purchaseToken);

    if (purchase === null) {
      throw this.invalid('unknown_token');
    }

    return purchase;
  }

  private async fetch(purchaseToken: string): Promise<PlayPurchase | null> {
    try {
      return await this.playStoreGateway.fetchPurchase(purchaseToken);
    } catch (error) {
      throw this.toBusinessException(error);
    }
  }

  private async acknowledgeIfNeeded(purchase: PlayPurchase): Promise<void> {
    if (!purchase.needsAcknowledge) {
      return;
    }

    try {
      await this.playStoreGateway.acknowledge(
        purchase.productId,
        purchase.purchaseToken,
      );
    } catch (error) {
      throw this.toBusinessException(error);
    }
  }

  private toBusinessException(error: unknown): unknown {
    if (!(error instanceof PlayStoreError)) {
      return error;
    }

    return error.kind === 'unavailable'
      ? storeUnavailable()
      : this.invalid(error.reason);
  }

  /** 사유는 응답에 싣지 않고 로그에만 남긴다. 구매 토큰은 남기지 않는다(`convention.md` 8.4) */
  private invalid(reason: string) {
    this.logger.warn('play purchase rejected', { reason });

    return receiptInvalid();
  }
}
