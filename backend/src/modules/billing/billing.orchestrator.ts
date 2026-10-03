import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { Plan } from '@/modules/subscription/entities/plan.entity';
import { Subscription } from '@/modules/subscription/entities/subscription.entity';
import { classifyTransaction } from '@/modules/subscription/policies/store-state.policy';
import {
  PlanService,
  toEntitlements,
} from '@/modules/subscription/services/plan.service';
import { PurchaseIntentService } from '@/modules/subscription/services/purchase-intent.service';
import { SubscriptionService } from '@/modules/subscription/services/subscription.service';
import {
  NON_TERMINAL_SUBSCRIPTION_STATUSES,
  SubscriptionStore,
} from '@/modules/subscription/subscription.enum';
import { StoreTransaction } from '@/modules/subscription/subscription.types';
import { UserService } from '@/modules/user/services/user.service';
import { DevicePlatform } from '@/modules/user/user.enum';

import {
  AppStoreGateway,
  AppStoreVerificationError,
} from './app-store/app-store.gateway';
import { PlanAction } from './billing.enum';
import {
  CreatePurchaseIntentCommand,
  PlanCatalog,
  PlanOffer,
  PurchaseIntentResult,
  RestorePurchasesCommand,
  RestoreResult,
  SubmitPurchaseCommand,
  SubscriptionView,
} from './billing.types';
import { BillingSyncService } from './services/billing-sync.service';
import { SubscriptionReconcileService } from './services/subscription-reconcile.service';

const STORE_BY_PLATFORM: Readonly<Record<DevicePlatform, SubscriptionStore>> = {
  [DevicePlatform.IOS]: SubscriptionStore.APP_STORE,
  [DevicePlatform.ANDROID]: SubscriptionStore.PLAY_STORE,
};

/**
 * 구독·인앱 결제의 사용자 유스케이스(`subscription-api.md` 4.1~4.5).
 *
 * `subscription`(요금제·구독·결제 의도)과 `user`(이메일 인증·티어 캐시)를 함께 쓴다. 판정 순서와 응답 조립만
 * 여기 있고, 스토어 사실의 반영은 `BillingSyncService`가, 서명 검증은 `AppStoreGateway`가 한다.
 */
@Injectable()
export class BillingOrchestrator {
  private readonly logger = new Logger(BillingOrchestrator.name);

  constructor(
    private readonly planService: PlanService,
    private readonly subscriptionService: SubscriptionService,
    private readonly purchaseIntentService: PurchaseIntentService,
    private readonly userService: UserService,
    private readonly billingSyncService: BillingSyncService,
    private readonly subscriptionReconcileService: SubscriptionReconcileService,
    private readonly appStoreGateway: AppStoreGateway,
    private readonly dataSource: DataSource,
  ) {}

  /** 4.1 — 요금제 목록 + 그 사용자가 각 요금제에 할 수 있는 일 */
  async listPlans(
    userId: string,
    platform: DevicePlatform,
  ): Promise<PlanCatalog> {
    const [user, plans, current] = await Promise.all([
      this.userService.getById(userId),
      this.planService.findAllActive(),
      this.findLiveSubscription(userId),
    ]);
    const currentPlan =
      current === null ? null : await this.planService.findByTier(current.tier);
    const isPurchasable = this.isStoreEnabled(platform);
    const isOtherStore =
      current !== null && current.store !== STORE_BY_PLATFORM[platform];

    const offers = plans.map((plan): PlanOffer => {
      const storeProductId = productIdOf(plan, platform);

      return {
        planId: plan.id,
        tier: plan.tier,
        name: plan.name,
        description: plan.description,
        priceKrw: plan.priceKrw,
        storeProductId,
        entitlements: toEntitlements(plan),
        action: resolvePlanAction({
          plan,
          hasProduct: storeProductId !== null && isPurchasable,
          current,
          currentPlan,
          isOtherStore,
        }),
      };
    });

    return { plans: offers, isEmailVerified: hasVerifiedEmail(user) };
  }

  /**
   * 4.2 — 현재 구독 상태. **조회가 상태를 바꾸는 유일한 경우가 만료 보정이다** — 알림이 유실돼 만료일이
   * 지났는데도 유효로 남은 행을 스토어에 물어 맞춘 뒤 응답한다. 보정은 실패해도 조회를 막지 않는다.
   */
  async getSubscription(userId: string, now: Date): Promise<SubscriptionView> {
    await this.subscriptionReconcileService.reconcileUser(userId, now);

    return this.buildView(userId, now);
  }

  /** 4.3 — 결제 시트를 열기 직전의 서버 관문. 통과하면 계정 결속 토큰(의도 `id`)을 발급한다 */
  async createPurchaseIntent(
    command: CreatePurchaseIntentCommand,
  ): Promise<PurchaseIntentResult> {
    const { userId, planId, platform } = command;
    const user = await this.userService.getById(userId);

    // 1. 이메일 인증(FR-39) — 결제만 되고 연락처가 없는 상태를 만들지 않는다
    if (!hasVerifiedEmail(user)) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.EMAIL_REQUIRED_FOR_PURCHASE,
        message: '구독하려면 이메일 인증이 필요해요',
        logLevel: 'info',
      });
    }

    // 2. 요금제 — 판매 중인 유료 요금제이고 그 플랫폼에서 살 수 있어야 한다.
    //    검증 구성이 없는 플랫폼도 여기서 막는다(결제부터 시키고 검증을 못 하는 상태를 만들지 않는다)
    const plan = await this.planService.findById(planId);
    const storeProductId = plan === null ? null : productIdOf(plan, platform);

    if (
      plan === null ||
      !plan.isActive ||
      plan.priceKrw <= 0 ||
      storeProductId === null ||
      !this.isStoreEnabled(platform)
    ) {
      throw planUnavailable();
    }

    // 3. 다른 스토어에서 구독 중 — 한 계정에 두 스토어 결제를 겹치지 않는다
    const current = await this.findLiveSubscription(userId);

    if (current !== null && current.store !== STORE_BY_PLATFORM[platform]) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.SUBSCRIPTION_STORE_MISMATCH,
        message: '다른 스토어에서 구독 중이에요. 구독한 기기에서 변경해주세요',
        logLevel: 'info',
      });
    }

    const intent = await this.purchaseIntentService.create({
      userId,
      planId: plan.id,
      platform,
    });

    this.logger.log('purchase intent created', {
      user_id: userId,
      intent_id: intent.id,
      tier: plan.tier,
      platform,
      entry_point: command.entryPoint,
    });

    return { intentId: intent.id, storeProductId };
  }

  /**
   * 4.4 — 영수증 제출. 서명을 검증하고, 유효한 거래면 구독과 `users.tier`를 **한 트랜잭션에서** 반영한다.
   * 실패하면 아무것도 쓰지 않는다 — 클라이언트는 200을 받기 전에는 거래를 끝내지 않는다.
   */
  async submitPurchase(
    command: SubmitPurchaseCommand,
  ): Promise<SubscriptionView> {
    const { userId, now } = command;
    const transaction = await this.verify(
      command.platform,
      command.signedTransaction,
    );
    const plan = await this.findPlanOrInvalid(transaction);

    // 구매 제출인데 지금 유효한 구독이 아니다(만료·환불된 거래) — 복원과 달리 오류다
    if (classifyTransaction(transaction, now) !== 'valid') {
      throw this.receiptInvalid('not_valid_now');
    }

    await this.dataSource.transaction(async (manager) => {
      await this.billingSyncService.assertOwnedBy(userId, transaction, manager);

      const outcome = await this.billingSyncService.applyTransaction(
        userId,
        transaction,
        plan.tier,
        manager,
      );

      // 환불·만료 통지 뒤에 그 전의 거래를 다시 낸 것 — 권한을 되살리지 않는다
      if (
        outcome.kind === 'ignored' &&
        outcome.reason === 'replayed_after_termination'
      ) {
        throw this.receiptInvalid(outcome.reason);
      }

      await this.billingSyncService.syncUserTier(userId, manager);

      this.logger.log('purchase applied', {
        user_id: userId,
        original_transaction_id: transaction.originalTransactionId,
        tier: plan.tier,
        environment: transaction.environment,
        outcome: outcome.kind,
      });
    });

    return this.buildView(userId, now);
  }

  /**
   * 4.5 — 구매 복원. "지금 살아 있는 것을 찾아 달라"는 요청이라 만료·환불된 거래는 오류가 아니라 무시한다.
   * 위조로 보이는 거래나 다른 계정의 구독이 하나라도 섞이면 요청 전체를 거부한다(일부만 반영하지 않는다).
   */
  async restorePurchases(
    command: RestorePurchasesCommand,
  ): Promise<RestoreResult> {
    const { userId, now } = command;

    // 서명 검증은 트랜잭션 밖에서 — Apple 확인(네트워크)을 기다리는 동안 행을 잠그지 않는다
    const verified: { transaction: StoreTransaction; plan: Plan }[] = [];

    for (const signedTransaction of command.signedTransactions) {
      const transaction = await this.verify(
        command.platform,
        signedTransaction,
      );

      verified.push({
        transaction,
        plan: await this.findPlanOrInvalid(transaction),
      });
    }

    // 같은 순서로 잠근다 — 두 복원 요청이 같은 구독들을 엇갈려 잠그면 교착한다
    verified.sort((a, b) =>
      a.transaction.originalTransactionId.localeCompare(
        b.transaction.originalTransactionId,
      ),
    );

    const restoredCount = await this.dataSource.transaction(async (manager) => {
      let linked = 0;

      for (const { transaction, plan } of verified) {
        await this.billingSyncService.assertOwnedBy(
          userId,
          transaction,
          manager,
        );

        if (classifyTransaction(transaction, now) !== 'valid') {
          continue;
        }

        const outcome = await this.billingSyncService.applyTransaction(
          userId,
          transaction,
          plan.tier,
          manager,
        );

        // 이미 연결돼 있던 것(unchanged)·더 새 주기가 저장돼 있던 것(older_transaction)도 "연결돼 있다"
        if (
          outcome.kind !== 'ignored' ||
          outcome.reason === 'older_transaction'
        ) {
          linked += 1;
        }
      }

      await this.billingSyncService.syncUserTier(userId, manager);

      return linked;
    });

    this.logger.log('purchases restored', {
      user_id: userId,
      submitted: verified.length,
      restored: restoredCount,
    });

    return {
      restored: restoredCount > 0,
      subscription: await this.buildView(userId, now),
    };
  }

  /** 4.2의 본문 — 영수증 제출·복원도 같은 것을 돌려준다(클라이언트가 다시 조회하지 않는다) */
  private async buildView(
    userId: string,
    now: Date,
  ): Promise<SubscriptionView> {
    const user = await this.userService.getById(userId);
    const [plan, current] = await Promise.all([
      this.subscriptionService.buildPlanView(userId, {
        trialEndsAt: user.trialEndsAt,
        now,
      }),
      this.findLiveSubscription(userId),
    ]);
    const [entitlements, pendingPlan] = await Promise.all([
      this.planService.getEntitlements(plan.tier),
      current?.pendingTier
        ? this.planService.findByTier(current.pendingTier)
        : null,
    ]);

    return {
      plan,
      // 한도는 플랜 요약과 같은 값을 싣는다 — 가입 체험 중인 구독자는 요금제 한도보다 넉넉하다(subscription.md 4.8)
      entitlements: { ...entitlements, dailyPlayLimit: plan.dailyPlayLimit },
      store: current?.store ?? null,
      pendingPlan:
        current === null || current.pendingTier === null
          ? null
          : {
              tier: current.pendingTier,
              planName: pendingPlan?.name ?? current.pendingTier,
              effectiveAt: current.expiresAt,
            },
    };
  }

  /** 권한이 살아 있는 현재 구독 — 없거나 종결(`expired`·`refunded`)뿐이면 `null` */
  private async findLiveSubscription(
    userId: string,
  ): Promise<Subscription | null> {
    const current = await this.subscriptionService.findCurrent(userId);

    return current !== null &&
      NON_TERMINAL_SUBSCRIPTION_STATUSES.includes(current.status)
      ? current
      : null;
  }

  /** 그 플랫폼의 결제를 서버가 검증할 수 있는가. Play는 구현 전이라 항상 꺼져 있다(1장) */
  private isStoreEnabled(platform: DevicePlatform): boolean {
    return platform === DevicePlatform.IOS && this.appStoreGateway.isEnabled();
  }

  private async verify(
    platform: DevicePlatform,
    signedTransaction: string | null,
  ): Promise<StoreTransaction> {
    if (!this.isStoreEnabled(platform) || signedTransaction === null) {
      throw planUnavailable();
    }

    try {
      return await this.appStoreGateway.verifyTransaction(signedTransaction);
    } catch (error) {
      if (error instanceof AppStoreVerificationError) {
        throw error.kind === 'unavailable'
          ? storeUnavailable()
          : this.receiptInvalid(error.reason);
      }

      throw error;
    }
  }

  /**
   * 사유는 응답에 싣지 않고 로그에만 남긴다 — 위조 시도에 무엇이 틀렸는지 알려 주지 않는다.
   * 서명 원문·토큰은 남기지 않는다(`convention.md` 8.4).
   */
  private receiptInvalid(reason: string): BusinessException {
    this.logger.warn('store receipt rejected', { reason });

    return new BusinessException({
      status: HttpStatus.BAD_REQUEST,
      errorCode: ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
      message: '구독을 확인할 수 없어요',
      logLevel: 'info',
    });
  }

  /** 거래의 상품이 어느 요금제인지 — **클라이언트가 보낸 상품 ID가 아니라 서명된 거래의 값**으로 찾는다 */
  private async findPlanOrInvalid(
    transaction: StoreTransaction,
  ): Promise<Plan> {
    const plan = await this.planService.findByStoreProductId(
      transaction.store,
      transaction.productId,
    );

    if (plan === null) {
      throw this.receiptInvalid('unknown_product');
    }

    return plan;
  }
}

function productIdOf(plan: Plan, platform: DevicePlatform): string | null {
  return platform === DevicePlatform.IOS
    ? plan.storeProductIdIos
    : plan.storeProductIdAndroid;
}

function hasVerifiedEmail(user: {
  email: string | null;
  isEmailVerified: boolean;
}): boolean {
  return user.email !== null && user.isEmailVerified;
}

/**
 * `action` 판정(`subscription-api.md` 4.1). 티어의 높낮이는 `display_order`로 본다 — 티어명을 비교하지 않는다.
 */
export function resolvePlanAction(input: {
  plan: Plan;
  /** 그 플랫폼에서 지금 살 수 있는가(상품 ID가 있고 서버가 검증할 수 있다) */
  hasProduct: boolean;
  current: Pick<Subscription, 'tier'> | null;
  currentPlan: Pick<Plan, 'displayOrder'> | null;
  isOtherStore: boolean;
}): PlanAction {
  const { plan, hasProduct, current, currentPlan, isOtherStore } = input;

  // "이용 중"은 살 수 있는지와 무관하다 — 판매를 멈췄거나 다른 스토어여도 지금 쓰는 요금제다
  if (current !== null && current.tier === plan.tier) {
    return PlanAction.CURRENT;
  }

  // 무료로 가는 것은 구매가 아니라 해지다(스토어로 이동). 다른 스토어 구독자는 여기서 바꿀 수 없다
  if (plan.priceKrw <= 0 || !hasProduct || isOtherStore) {
    return PlanAction.NONE;
  }

  if (current === null || currentPlan === null) {
    return PlanAction.PURCHASE;
  }

  return plan.displayOrder > currentPlan.displayOrder
    ? PlanAction.UPGRADE
    : PlanAction.DOWNGRADE;
}

function planUnavailable(): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.SUBSCRIPTION_PLAN_UNAVAILABLE,
    message: '지금은 이 요금제를 구독할 수 없어요',
    logLevel: 'info',
  });
}

function storeUnavailable(): BusinessException {
  return new BusinessException({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    errorCode: ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
    message: '구독을 확인하고 있어요. 잠시 후 자동으로 반영됩니다',
    retryable: true,
  });
}
