import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import {
  StoreNotificationInput,
  StoreStateDecision,
  StoreStateIgnoreReason,
  StoreStatusInput,
  StoredSubscriptionState,
  isTerminalStatus,
  resolveFromAppStoreNotification,
  resolveFromStoreStatus,
  resolveFromTransaction,
} from '@/modules/subscription/policies/store-state.policy';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { PurchaseIntentService } from '@/modules/subscription/services/purchase-intent.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import {
  NON_TERMINAL_SUBSCRIPTION_STATUSES,
  SubscriptionStatus,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import {
  StoreTransaction,
  SubscriptionState,
} from '@/modules/subscription/subscription.types';
import { UserService } from '@/modules/user/services/user.service';
import { UserTier } from '@/modules/user/user.enum';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 반영 결과 — 호출부가 응답을 가르는 근거 */
export type SyncOutcome =
  | { kind: 'applied' }
  | { kind: 'unchanged' }
  | { kind: 'ignored'; reason: StoreStateIgnoreReason }
  /** 알림의 구독이 어느 계정 것인지 알 수 없다 — 이후 영수증 제출·복원이 연결한다 */
  | { kind: 'unlinked' };

/**
 * **스토어가 말한 사실을 `subscriptions`와 `users.tier`에 반영하는 단 하나의 경로**(`subscription-api.md` 7장).
 *
 * 영수증 제출·복원·스토어 서버 알림·만료 보정이 전부 이 서비스를 거친다. 상태 환산은 순수 정책
 * (`store-state.policy.ts`)이 하고, 여기는 잠금·저장·티어 캐시 갱신만 한다.
 *
 * **모든 메서드는 호출부의 트랜잭션 안에서 돈다**(`manager` 필수) — 구독 행과 `users.tier`가 한 번에 바뀌어야
 * "결제는 반영됐는데 한도는 무료"인 순간이 없다.
 *
 * 이 모듈에 있는 이유: `user` 모듈이 `subscription` 모듈을 의존해서(탈퇴 시 결제 이력 판정) 반대 방향으로는
 * 의존할 수 없다. 둘을 함께 쓰는 유스케이스 모듈이 `users.tier` 갱신을 맡는다(architecture.md 4.3).
 */
@Injectable()
export class BillingSyncService {
  private readonly logger = new Logger(BillingSyncService.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly planService: PlanService,
    private readonly purchaseIntentService: PurchaseIntentService,
    private readonly userService: UserService,
  ) {}

  /**
   * 거래의 주인 확인(`subscription-api.md` 7장). 그 스토어 구독이 **살아 있는 다른 계정**에 묶여 있으면 거부한다 —
   * 구독 행이 다른 사용자의 것이거나, 결제에 실어 보낸 계정 토큰이 다른 사용자의 결제 의도다.
   *
   * 탈퇴한 계정은 구독·의도 행이 파기돼 있어 걸리지 않는다 — 재가입 복원이 이 경로로 성립한다.
   *
   * **예외 — 끝난 구독의 재결제(2026-10-06).** 행이 다른 계정의 것이어도 그 구독이 이미 끝났고(`expired`·
   * `refunded`) 이 거래가 **요청자의 결제 의도로 결제된 것**이면 통과시킨다 — 반영할 때 행을 요청자에게 넘긴다
   * (`applyDecision`). App Store는 같은 Apple 계정이 같은 구독 그룹을 다시 결제하면 예전 `originalTransactionId`를
   * 이어 쓸 수 있어, 막으면 방금 결제한 계정이 409를 받고 예전 계정이 유료가 된다.
   */
  async assertOwnedBy(
    userId: string,
    transaction: StoreTransaction,
    manager: EntityManager,
  ): Promise<void> {
    const existing = await this.subscriptionService.findByOriginalTransactionId(
      transaction.originalTransactionId,
      manager,
    );
    const tokenOwnerId = await this.findOwnerByToken(
      transaction.accountToken,
      manager,
    );

    const isOwnedByAnother = existing !== null && existing.userId !== userId;
    const canTakeOver =
      isOwnedByAnother &&
      isTerminalStatus(existing.status) &&
      tokenOwnerId === userId;

    if (
      (isOwnedByAnother && !canTakeOver) ||
      (tokenOwnerId !== null && tokenOwnerId !== userId)
    ) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
        message: '이미 다른 계정에서 사용 중인 구독이에요',
      });
    }
  }

  /**
   * 클라이언트가 제출한 **유효한** 거래를 그 사용자의 구독으로 반영한다. 주인 확인(`assertOwnedBy`)과
   * 유효성 판정(`classifyTransaction`)은 호출부가 먼저 한다.
   */
  async applyTransaction(
    userId: string,
    transaction: StoreTransaction,
    tier: UserTier,
    manager: EntityManager,
  ): Promise<SyncOutcome> {
    const outcome = await this.applyDecision(
      userId,
      transaction,
      manager,
      (existing) => resolveFromTransaction(existing, transaction, tier),
      // 거래 제출은 알림이 아니다 — 알림 순서 기준 시각을 건드리지 않는다
      null,
    );

    if (transaction.accountToken !== null) {
      await this.markIntentVerified(userId, transaction.accountToken, manager);
    }

    return outcome;
  }

  /**
   * 스토어 서버 알림을 반영한다. 구독 행이 없으면(영수증 제출보다 알림이 먼저 도착) 거래의 계정 토큰으로
   * 사용자를 찾아 행을 만든다. 토큰으로도 찾지 못하면 `unlinked`다.
   */
  async applyNotification(
    input: Omit<StoreNotificationInput, 'tier' | 'renewalTier'>,
    now: Date,
    manager: EntityManager,
  ): Promise<SyncOutcome> {
    const { transaction, renewal } = input;

    if (transaction === null) {
      return { kind: 'ignored', reason: 'no_transaction' };
    }

    const existing = await this.subscriptionService.lockByOriginalTransactionId(
      transaction.originalTransactionId,
      manager,
    );
    const tokenOwnerId = await this.findOwnerByToken(
      transaction.accountToken,
      manager,
    );
    // 끝난 구독을 다른 계정이 자기 결제 의도로 다시 결제했다면 그 계정의 구독이다(`assertOwnedBy`의 예외와 같은
    // 규칙) — 행 주인에게 그대로 반영하면 결제하지 않은 예전 계정이 유료가 된다. 토큰은 있는데 의도가 없으면
    // (탈퇴로 파기) 끝난 행의 주인에게도 반영하지 않는다 — 결제한 계정은 떠났고 예전 주인은 결제하지 않았다(7장)
    const userId =
      existing !== null && isTerminalStatus(existing.status)
        ? transaction.accountToken !== null
          ? tokenOwnerId
          : existing.userId
        : (existing?.userId ?? tokenOwnerId);

    if (userId === null) {
      return { kind: 'unlinked' };
    }

    const tier = await this.findTier(
      transaction,
      transaction.productId,
      manager,
    );
    const renewalTier =
      renewal?.autoRenewProductId != null
        ? await this.findTier(transaction, renewal.autoRenewProductId, manager)
        : null;

    const outcome = await this.applyDecision(
      userId,
      transaction,
      manager,
      (stored) =>
        resolveFromAppStoreNotification(
          stored,
          { ...input, tier, renewalTier },
          now,
        ),
      input.signedAt,
    );

    // 반영된 것이 없으면(끝난 구독의 넘겨받기 거절 등) 의도도 확인된 것이 아니다(2026-10-07)
    if (
      transaction.accountToken !== null &&
      outcome.kind !== 'ignored' &&
      (existing === null || existing.userId !== userId)
    ) {
      await this.markIntentVerified(userId, transaction.accountToken, manager);
    }

    return outcome;
  }

  /**
   * 만료 보정의 상한(`subscription-api.md` 4.2) — **스토어에 확인할 수 없는 채로** 만료일이 `before`보다 앞선
   * 비종결 구독을 만료로 내린다. 내렸으면 `true`.
   *
   * 알림 순서 기준 시각(`last_notified_at`)은 건드리지 않는다 — 스토어가 말한 사실이 아니라 우리의 추정이라,
   * 뒤늦게 도착한 갱신 알림·거래가 그대로 되살릴 수 있어야 한다.
   */
  async expireUnverifiable(
    originalTransactionId: string,
    before: Date,
    manager: EntityManager,
  ): Promise<boolean> {
    const subscription =
      await this.subscriptionService.lockByOriginalTransactionId(
        originalTransactionId,
        manager,
      );

    // 조회와 잠금 사이에 알림이 먼저 정리했을 수 있다 — 잠근 뒤 다시 본다
    if (
      subscription === null ||
      isTerminalStatus(subscription.status) ||
      subscription.expiresAt.getTime() >= before.getTime()
    ) {
      return false;
    }

    subscription.status = SubscriptionStatus.EXPIRED;
    subscription.isAutoRenew = false;
    subscription.pendingTier = null;

    await this.subscriptionService.save(subscription, manager);
    await this.syncUserTier(subscription.userId, manager);

    return true;
  }

  /** 만료 보정 — 스토어에 직접 물어 얻은 현재 상태로 맞춘다(`subscription-api.md` 4.2). 행이 있어야 한다 */
  async applyStoreStatus(
    subscription: Subscription,
    input: Omit<StoreStatusInput, 'tier' | 'renewalTier'>,
    manager: EntityManager,
  ): Promise<SyncOutcome> {
    return this.applyStoreSnapshot(subscription.userId, input, manager, {
      createIfMissing: false,
    });
  }

  /**
   * 스토어가 답한 "지금 상태"를 그 사용자의 구독으로 반영한다. **Play의 모든 경로**(영수증 제출·복원·알림·보정)가
   * 이것을 쓴다 — Play는 알림이 신호일 뿐이라 매번 현재 상태를 조회해 그대로 반영한다(4.7).
   *
   * `createIfMissing`이 켜져 있으면 행이 없을 때 조회 결과로 만든다(첫 구매). 주인 확인은 호출부가 먼저 한다.
   */
  async applyStoreSnapshot(
    userId: string,
    input: Omit<StoreStatusInput, 'tier' | 'renewalTier'>,
    manager: EntityManager,
    options: { createIfMissing: boolean },
  ): Promise<SyncOutcome> {
    const { transaction, renewal } = input;
    const tier = await this.findTier(
      transaction,
      transaction.productId,
      manager,
    );
    const renewalTier =
      renewal?.autoRenewProductId != null
        ? await this.findTier(transaction, renewal.autoRenewProductId, manager)
        : null;

    const outcome = await this.applyDecision(
      userId,
      transaction,
      manager,
      (stored) =>
        stored === null && !options.createIfMissing
          ? { kind: 'ignore', reason: 'terminated' }
          : resolveFromStoreStatus(stored, { ...input, tier, renewalTier }),
      input.checkedAt,
    );

    if (options.createIfMissing && transaction.accountToken !== null) {
      await this.markIntentVerified(userId, transaction.accountToken, manager);
    }

    return outcome;
  }

  /**
   * Play 구매 토큰이 **어느 구독 행의 것인지** 정한다 — 그 행의 `original_transaction_id`를 돌려준다.
   *
   * Play에는 App Store의 `originalTransactionId`가 없어 그 구독의 최초 구매 토큰을 자연 키로 쓴다. 그런데
   * 업·다운그레이드·재구독마다 새 토큰이 나오므로, 새 토큰을 그대로 키로 쓰면 같은 구독이 새 행이 된다
   * (한 사용자에게 살아 있는 구독이 둘이 된다). 그래서 순서대로 찾는다.
   *
   * 1. 이 토큰이 이미 어느 행의 키이거나 마지막 영수증이면 그 행
   * 2. Google이 알려 준 이전 토큰(`linkedPurchaseToken`)이 어느 행의 키이거나 마지막 영수증이면 그 행
   * 3. 어디에도 없으면 새 구독이다 — 이 토큰이 키가 된다
   */
  async resolvePlayOriginalId(
    purchaseToken: string,
    linkedPurchaseToken: string | null,
    manager?: EntityManager,
  ): Promise<string> {
    for (const token of [purchaseToken, linkedPurchaseToken]) {
      if (token === null) {
        continue;
      }

      const row =
        (await this.subscriptionService.findByOriginalTransactionId(
          token,
          manager,
        )) ??
        (await this.subscriptionService.findByLatestReceipt(
          SubscriptionStore.PLAY_STORE,
          token,
          manager,
        ));

      if (row !== null) {
        return row.originalTransactionId;
      }
    }

    return purchaseToken;
  }

  /** 계정 토큰(= 결제 의도 `id`)의 주인 — 알림처럼 "누구의 구독인지" 모르는 경로가 쓴다 */
  async findAccountTokenOwner(
    accountToken: string | null,
    manager?: EntityManager,
  ): Promise<string | null> {
    return this.findOwnerByToken(accountToken, manager);
  }

  /** 그 스토어 구독이 연결된 사용자 — 없으면 `null` */
  async findSubscriptionOwner(
    originalTransactionId: string,
    manager: EntityManager,
  ): Promise<string | null> {
    const subscription =
      await this.subscriptionService.findByOriginalTransactionId(
        originalTransactionId,
        manager,
      );

    return subscription?.userId ?? null;
  }

  /**
   * `users.tier` 캐시를 `subscriptions`에 맞춘다 — **이 값을 쓰는 유일한 경로다**(domain.md 3.1).
   *
   * 방금 고친 행 하나가 아니라 그 사용자의 구독 전체에서 다시 고른다 — 한 사용자가 구독 행을 여럿 가질 수 있고
   * (스토어 구독 그룹이 다르거나 스토어가 다르다), 하나가 만료돼도 다른 하나가 살아 있으면 유료다.
   */
  async syncUserTier(userId: string, manager: EntityManager): Promise<void> {
    const current = await this.subscriptionService.findCurrent(userId, manager);
    const tier =
      current !== null &&
      NON_TERMINAL_SUBSCRIPTION_STATUSES.includes(current.status)
        ? current.tier
        : UserTier.LIGHT;

    const changed = await this.userService.updateTier(userId, tier, manager);

    if (changed) {
      this.logger.log('user tier synced from subscription', {
        user_id: userId,
        tier,
        subscription_id: current?.id ?? null,
      });
    }
  }

  /**
   * 잠금 → 판정 → 저장의 공통 뼈대. 행이 없으면 판정 결과로 만들고, 동시에 도착한 요청이 먼저 만들었으면
   * 그 행을 잠가 **다시 판정한다**(먼저 온 쪽의 상태 위에서).
   */
  private async applyDecision(
    userId: string,
    transaction: StoreTransaction,
    manager: EntityManager,
    resolve: (existing: StoredSubscriptionState | null) => StoreStateDecision,
    /** 이 반영이 알림·조회에서 왔다면 그 시각 — 이후 더 이른 알림이 덮지 못하게 남긴다 */
    notifiedAt: Date | null,
  ): Promise<SyncOutcome> {
    let subscription =
      await this.subscriptionService.lockByOriginalTransactionId(
        transaction.originalTransactionId,
        manager,
      );

    if (subscription === null) {
      const decision = resolve(null);

      if (decision.kind !== 'apply') {
        return toOutcome(decision);
      }

      const result = await this.subscriptionService.createOrLock(
        {
          userId,
          store: transaction.store,
          environment: transaction.environment,
          originalTransactionId: transaction.originalTransactionId,
          latestReceipt: transaction.receipt,
          latestOrderId: transaction.orderId ?? null,
          ...decision.state,
          startedAt: transaction.originalPurchasedAt,
          lastNotifiedAt: notifiedAt,
        },
        manager,
      );

      if (result.created) {
        return { kind: 'applied' };
      }

      subscription = result.subscription;
    }

    /** 끝난 구독을 넘겨받는 중이면 그 전 주인(`assertOwnedBy`의 예외) */
    let previousOwnerId: string | null = null;

    if (subscription.userId !== userId) {
      const canTakeOver =
        isTerminalStatus(subscription.status) &&
        (await this.findOwnerByToken(transaction.accountToken, manager)) ===
          userId;

      if (!canTakeOver) {
        // 잠그는 사이에 다른 계정이 먼저 연결했다 — 주인 확인을 통과한 뒤의 경합이다
        throw new BusinessException({
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT,
          message: '이미 다른 계정에서 사용 중인 구독이에요',
        });
      }

      previousOwnerId = subscription.userId;
    }

    const decision = resolve(toStoredState(subscription));

    if (decision.kind === 'ignore') {
      return toOutcome(decision);
    }

    if (previousOwnerId !== null) {
      // 넘겨받는 것은 구독이 **되살아날 때뿐**이다 — 끝난 채로 남는 반영이면 남의 행을 건드리지 않는다
      if (
        decision.kind !== 'apply' ||
        isTerminalStatus(decision.state.status)
      ) {
        return { kind: 'ignored', reason: 'terminated' };
      }

      subscription.userId = userId;
    }

    if (decision.kind === 'apply') {
      assignState(subscription, decision.state);
      subscription.latestReceipt = transaction.receipt;
      // Play만 값이 있다 — App Store 거래(undefined)는 건드리지 않는다
      if (transaction.orderId !== undefined) {
        subscription.latestOrderId = transaction.orderId;
      }
      subscription.environment = transaction.environment;
    }

    if (notifiedAt !== null) {
      subscription.lastNotifiedAt = notifiedAt;
    }

    if (decision.kind === 'apply' || notifiedAt !== null) {
      await this.subscriptionService.save(subscription, manager);
    }

    if (previousOwnerId !== null) {
      // 끝난 구독이었으니 전 주인의 티어는 이미 이 행과 무관하다 — 캐시가 어긋나 있었을 경우만 맞춘다
      await this.syncUserTier(previousOwnerId, manager);

      this.logger.log('terminated subscription taken over by repurchase', {
        subscription_id: subscription.id,
        user_id: userId,
        previous_user_id: previousOwnerId,
      });
    }

    return toOutcome(decision);
  }

  private async findTier(
    transaction: StoreTransaction,
    productId: string,
    manager: EntityManager,
  ): Promise<UserTier | null> {
    const plan = await this.planService.findByStoreProductId(
      transaction.store,
      productId,
      manager,
    );

    return plan?.tier ?? null;
  }

  /** 계정 토큰(= 결제 의도 `id`)의 주인. 토큰이 없거나 의도 행이 없으면(탈퇴로 파기) `null` */
  private async findOwnerByToken(
    accountToken: string | null,
    manager?: EntityManager,
  ): Promise<string | null> {
    // 스토어 밖에서 온 값이다 — uuid 컬럼에 그대로 넣으면 형식 오류로 쿼리가 실패한다
    if (accountToken === null || !UUID_PATTERN.test(accountToken)) {
      return null;
    }

    const intent = await this.purchaseIntentService.findById(
      accountToken,
      manager,
    );

    return intent?.userId ?? null;
  }

  private async markIntentVerified(
    userId: string,
    accountToken: string,
    manager: EntityManager,
  ): Promise<void> {
    if ((await this.findOwnerByToken(accountToken, manager)) === userId) {
      await this.purchaseIntentService.markVerified(accountToken, manager);
    }
  }
}

function toStoredState(subscription: Subscription): StoredSubscriptionState {
  return {
    tier: subscription.tier,
    status: subscription.status,
    isAutoRenew: subscription.isAutoRenew,
    expiresAt: subscription.expiresAt,
    cancelledAt: subscription.cancelledAt,
    pendingTier: subscription.pendingTier,
    lastNotifiedAt: subscription.lastNotifiedAt,
    latestReceipt: subscription.latestReceipt,
    latestOrderId: subscription.latestOrderId,
  };
}

function assignState(
  subscription: Subscription,
  state: SubscriptionState,
): void {
  subscription.tier = state.tier;
  subscription.status = state.status;
  subscription.isAutoRenew = state.isAutoRenew;
  subscription.expiresAt = state.expiresAt;
  subscription.cancelledAt = state.cancelledAt;
  subscription.pendingTier = state.pendingTier;
}

function toOutcome(decision: StoreStateDecision): SyncOutcome {
  switch (decision.kind) {
    case 'apply':
      return { kind: 'applied' };
    case 'unchanged':
      return { kind: 'unchanged' };
    case 'ignore':
      return { kind: 'ignored', reason: decision.reason };
  }
}
