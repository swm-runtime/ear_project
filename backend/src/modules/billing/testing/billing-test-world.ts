import { DataSource, EntityManager } from 'typeorm';

import { Plan } from '@/modules/subscription/entities/plan.entity';
import { PurchaseIntent } from '@/modules/subscription/entities/purchase-intent.entity';
import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import { SubscriptionDraft } from '@/modules/subscription/repositories/subscription.repository';
import { PlanService } from '@/modules/subscription/services/plan.service';
import { PurchaseIntentService } from '@/modules/subscription/services/purchase-intent.service';
import { StoreNotificationLogService } from '@/modules/subscription/services/store-notification-log.service';
import { StoreNotificationLog } from '@/modules/subscription/entities/store-notification-log.entity';
import {
  SubscriptionService,
  selectCurrentSubscription,
} from '@/modules/subscription/services/subscription.service';
import {
  PurchaseIntentStatus,
  SubscriptionEnvironment,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import {
  StoreRenewalInfo,
  StoreTransaction,
} from '@/modules/subscription/subscription.types';
import { User } from '@/modules/user/entities/user.entity';
import { UserService } from '@/modules/user/services/user.service';
import { DevicePlatform, UserTier } from '@/modules/user/user.enum';

import {
  AppStoreGateway,
  AppStoreNotification,
  AppStoreSubscriptionStatus,
  AppStoreVerificationError,
} from '../app-store/app-store.gateway';

/**
 * 결제 단위 테스트의 **메모리 세계** — DB·Apple 없이 `BillingSyncService`·`BillingOrchestrator`를 실제 코드로 돌린다.
 *
 * 가짜로 바꾸는 것은 저장소(행을 배열에 둔다)와 서명 검증(서명 대신 JSON)뿐이다. 판정·잠금 순서·티어 반영은
 * 전부 진짜 코드가 한다. `PlanService`·`SubscriptionService`의 조회 규칙(현재 구독 선택, 권한 조립)은
 * 진짜 함수를 그대로 부른다 — 여기서 다시 구현하면 테스트가 구현을 검증하지 못한다.
 */
/** 가짜 검증기가 알림 속 거래의 "서명 원문" 자리에 넣는 표식 — 원문이 어디에 저장됐는지 추적할 때 쓴다 */
export const NOTIFICATION_RECEIPT_MARKER = 'fake-jws-from-notification';

export const PRODUCT_DAILY = 'com.runtime.ear.subscription.daily.monthly';
export const PRODUCT_PRO = 'com.runtime.ear.subscription.pro.monthly';

export function buildPlans(): Plan[] {
  const base = {
    dailyDripCount: 2,
    dailyDiscoveryCount: 1,
    isDripEnabled: true,
    storeProductIdAndroid: null,
    isActive: true,
  };

  return [
    {
      ...base,
      id: 'plan-light',
      tier: UserTier.LIGHT,
      name: '라이트',
      description: '무료',
      dailyPlayLimit: 2,
      isAdsEnabled: true,
      priceKrw: 0,
      storeProductIdIos: null,
      displayOrder: 1,
    },
    {
      ...base,
      id: 'plan-daily',
      tier: UserTier.DAILY,
      name: '데일리',
      description: '하루 5편',
      dailyPlayLimit: 5,
      isAdsEnabled: false,
      priceKrw: 3900,
      storeProductIdIos: PRODUCT_DAILY,
      displayOrder: 2,
    },
    {
      ...base,
      id: 'plan-pro',
      tier: UserTier.PRO,
      name: '프로',
      description: '무제한',
      dailyPlayLimit: null,
      isAdsEnabled: false,
      priceKrw: 9900,
      storeProductIdIos: PRODUCT_PRO,
      displayOrder: 3,
    },
  ] as Plan[];
}

/** 서명 대신 JSON을 "서명된 거래"로 쓴다 — 가짜 검증기가 풀어낸다 */
export function signTransaction(
  overrides: Partial<StoreTransaction> & {
    invalid?: 'invalid' | 'unavailable';
  },
): string {
  return JSON.stringify(overrides);
}

export class FakeAppStoreGateway extends AppStoreGateway {
  enabled = true;
  statusQueryable = true;
  /** `fetchStatus`가 돌려줄 답 — `originalTransactionId`별 */
  readonly statuses = new Map<string, AppStoreSubscriptionStatus | null>();
  fetchStatusError: AppStoreVerificationError | null = null;

  isEnabled(): boolean {
    return this.enabled;
  }

  verifyTransaction(signedTransaction: string): Promise<StoreTransaction> {
    const parsed = JSON.parse(
      signedTransaction,
    ) as Partial<StoreTransaction> & {
      invalid?: 'invalid' | 'unavailable';
    };

    if (parsed.invalid) {
      return Promise.reject(
        new AppStoreVerificationError(parsed.invalid, 'fake'),
      );
    }

    return Promise.resolve(buildTransaction(parsed, signedTransaction));
  }

  verifyNotification(signedPayload: string): Promise<AppStoreNotification> {
    const parsed = JSON.parse(signedPayload) as {
      invalid?: 'invalid' | 'unavailable';
      id: string;
      type: string;
      subtype?: string | null;
      signedAt: string;
      transaction?: Partial<StoreTransaction> | null;
      renewal?: Partial<StoreRenewalInfo> | null;
    };

    if (parsed.invalid) {
      return Promise.reject(
        new AppStoreVerificationError(parsed.invalid, 'fake'),
      );
    }

    return Promise.resolve({
      id: parsed.id,
      type: parsed.type,
      subtype: parsed.subtype ?? null,
      signedAt: new Date(parsed.signedAt),
      environment: SubscriptionEnvironment.SANDBOX,
      transaction: parsed.transaction
        ? buildTransaction(parsed.transaction, NOTIFICATION_RECEIPT_MARKER)
        : null,
      renewal: parsed.renewal
        ? {
            isAutoRenew: parsed.renewal.isAutoRenew ?? true,
            autoRenewProductId: parsed.renewal.autoRenewProductId ?? null,
            gracePeriodExpiresAt: parsed.renewal.gracePeriodExpiresAt
              ? new Date(parsed.renewal.gracePeriodExpiresAt)
              : null,
          }
        : null,
    });
  }

  canFetchStatus(): boolean {
    return this.enabled && this.statusQueryable;
  }

  fetchStatus(
    originalTransactionId: string,
  ): Promise<AppStoreSubscriptionStatus | null> {
    if (this.fetchStatusError) {
      return Promise.reject(this.fetchStatusError);
    }

    return Promise.resolve(this.statuses.get(originalTransactionId) ?? null);
  }
}

export function buildTransaction(
  overrides: Partial<StoreTransaction>,
  receipt = 'signed',
): StoreTransaction {
  const purchasedAt = new Date(overrides.purchasedAt ?? '2026-10-01T00:00:00Z');

  return {
    store: SubscriptionStore.APP_STORE,
    environment: overrides.environment ?? SubscriptionEnvironment.SANDBOX,
    originalTransactionId: overrides.originalTransactionId ?? 'otx-1',
    productId: overrides.productId ?? PRODUCT_PRO,
    originalPurchasedAt: new Date(overrides.originalPurchasedAt ?? purchasedAt),
    purchasedAt,
    expiresAt: new Date(overrides.expiresAt ?? '2026-11-01T00:00:00Z'),
    revokedAt: overrides.revokedAt ? new Date(overrides.revokedAt) : null,
    accountToken: overrides.accountToken ?? null,
    receipt,
  };
}

export class BillingTestWorld {
  readonly plans = buildPlans();
  readonly subscriptions: Subscription[] = [];
  readonly intents: PurchaseIntent[] = [];
  readonly users = new Map<string, User>();
  readonly gateway = new FakeAppStoreGateway();
  /** 트랜잭션이 몇 번 열렸는가 — "한 트랜잭션에서 반영"을 확인할 때 쓴다 */
  transactionCount = 0;

  private sequence = 0;

  /** 가짜 매니저 — 진짜 코드는 넘겨받은 것을 그대로 전달할 뿐 직접 쓰지 않는다 */
  readonly manager = {} as EntityManager;

  readonly dataSource = {
    /**
     * 콜백이 던지면 그 사이의 쓰기를 되돌린다 — "실패하면 아무것도 쓰지 않는다"를 검증하려면 롤백이 있어야 한다.
     */
    transaction: async <T>(work: (manager: EntityManager) => Promise<T>) => {
      this.transactionCount += 1;
      const snapshot = {
        subscriptions: this.subscriptions.map((row) => ({ ...row })),
        intents: this.intents.map((row) => ({ ...row })),
        tiers: [...this.users.values()].map((user) => [user.id, user.tier]),
        processed: this.notificationLogs.map((log) => log.processedAt),
      };

      try {
        return await work(this.manager);
      } catch (error) {
        this.subscriptions.splice(
          0,
          this.subscriptions.length,
          ...(snapshot.subscriptions as Subscription[]),
        );
        this.intents.splice(
          0,
          this.intents.length,
          ...(snapshot.intents as PurchaseIntent[]),
        );
        for (const [id, tier] of snapshot.tiers) {
          this.users.get(id)!.tier = tier as UserTier;
        }
        snapshot.processed.forEach((processedAt, index) => {
          this.notificationLogs[index].processedAt = processedAt;
        });
        throw error;
      }
    },
  } as unknown as DataSource;

  addUser(id: string, overrides: Partial<User> = {}): User {
    const user = {
      id,
      email: `${id}@example.com`,
      isEmailVerified: true,
      tier: UserTier.LIGHT,
      ...overrides,
    } as User;

    this.users.set(id, user);

    return user;
  }

  addIntent(userId: string, id: string, planId = 'plan-pro'): PurchaseIntent {
    const intent = {
      id,
      userId,
      planId,
      platform: DevicePlatform.IOS,
      status: PurchaseIntentStatus.CREATED,
    } as PurchaseIntent;

    this.intents.push(intent);

    return intent;
  }

  /** 탈퇴 — 구독·의도 행이 파기된다(domain.md 12.3) */
  withdraw(userId: string): void {
    this.users.delete(userId);
    for (const rows of [this.subscriptions, this.intents] as {
      userId: string;
    }[][]) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].userId === userId) {
          rows.splice(index, 1);
        }
      }
    }
  }

  readonly planService = {
    findById: (id: string) =>
      Promise.resolve(this.plans.find((plan) => plan.id === id) ?? null),
    findByTier: (tier: UserTier) =>
      Promise.resolve(this.plans.find((plan) => plan.tier === tier) ?? null),
    findAllActive: () =>
      Promise.resolve(
        this.plans
          .filter((plan) => plan.isActive)
          .sort((a, b) => a.displayOrder - b.displayOrder),
      ),
    findByStoreProductId: (_store: SubscriptionStore, productId: string) =>
      Promise.resolve(
        this.plans.find((plan) => plan.storeProductIdIos === productId) ?? null,
      ),
    getEntitlements: (tier: UserTier) =>
      PlanService.prototype.getEntitlements.call(this.planService, tier),
  } as unknown as PlanService;

  readonly subscriptionService = {
    findCurrent: (userId: string) =>
      Promise.resolve(
        selectCurrentSubscription(
          this.subscriptions.filter((row) => row.userId === userId),
        ),
      ),
    findByOriginalTransactionId: (originalTransactionId: string) =>
      Promise.resolve(this.findSubscription(originalTransactionId)),
    lockByOriginalTransactionId: (originalTransactionId: string) =>
      Promise.resolve(this.findSubscription(originalTransactionId)),
    createOrLock: (draft: SubscriptionDraft) => {
      const existing = this.findSubscription(draft.originalTransactionId);

      if (existing) {
        return Promise.resolve({ subscription: existing, created: false });
      }

      this.sequence += 1;
      const subscription = {
        ...draft,
        id: `sub-${this.sequence}`,
      } as Subscription;

      this.subscriptions.push(subscription);

      return Promise.resolve({ subscription, created: true });
    },
    save: (subscription: Subscription) => Promise.resolve(subscription),
    findOverdue: (before: Date) =>
      Promise.resolve(
        this.subscriptions.filter(
          (row) => row.expiresAt.getTime() < before.getTime(),
        ),
      ),
    buildPlanView: (userId: string) =>
      SubscriptionService.prototype.buildPlanView.call(
        Object.assign(Object.create(SubscriptionService.prototype), {
          subscriptionRepository: {
            findAllByUserId: (id: string) =>
              Promise.resolve(
                this.subscriptions.filter((row) => row.userId === id),
              ),
          },
          planService: this.planService,
          logger: { warn: () => undefined },
        }) as SubscriptionService,
        userId,
      ),
  } as unknown as SubscriptionService;

  readonly purchaseIntentService = {
    create: (draft: Pick<PurchaseIntent, 'userId' | 'planId' | 'platform'>) => {
      this.sequence += 1;

      return Promise.resolve(
        this.addIntent(
          draft.userId,
          `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
          draft.planId,
        ),
      );
    },
    findById: (id: string) =>
      Promise.resolve(this.intents.find((intent) => intent.id === id) ?? null),
    markVerified: (id: string) => {
      const intent = this.intents.find((candidate) => candidate.id === id);

      if (intent) {
        intent.status = PurchaseIntentStatus.VERIFIED;
      }

      return Promise.resolve();
    },
  } as unknown as PurchaseIntentService;

  readonly userService = {
    getById: (id: string) => {
      const user = this.users.get(id);

      return user
        ? Promise.resolve(user)
        : Promise.reject(new Error(`no user ${id}`));
    },
    updateTier: (id: string, tier: UserTier) => {
      const user = this.users.get(id)!;
      const changed = user.tier !== tier;

      user.tier = tier;

      return Promise.resolve(changed);
    },
  } as unknown as UserService;

  readonly notificationLogs: StoreNotificationLog[] = [];

  readonly storeNotificationLogService = {
    record: (
      draft: Pick<
        StoreNotificationLog,
        'store' | 'notificationId' | 'type' | 'payload'
      >,
    ) => {
      let log = this.notificationLogs.find(
        (candidate) =>
          candidate.store === draft.store &&
          candidate.notificationId === draft.notificationId,
      );

      if (!log) {
        this.sequence += 1;
        log = {
          ...draft,
          id: String(this.sequence),
          processedAt: null,
        } as StoreNotificationLog;
        this.notificationLogs.push(log);
      }

      return Promise.resolve(log);
    },
    markProcessed: (id: string, processedAt: Date) => {
      this.notificationLogs.find((log) => log.id === id)!.processedAt =
        processedAt;

      return Promise.resolve();
    },
  } as unknown as StoreNotificationLogService;

  private findSubscription(originalTransactionId: string): Subscription | null {
    return (
      this.subscriptions.find(
        (row) => row.originalTransactionId === originalTransactionId,
      ) ?? null
    );
  }
}
