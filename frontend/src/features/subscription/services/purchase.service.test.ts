import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { SubmittedTransaction } from '../api/subscription.api';
import { SUBMIT_RETRY_DELAYS_MS } from '../subscription.constants';
import type { MySubscription, Plan, PurchaseIntent, PurchasePlatform } from '../subscription.types';
import { StoreError, type IapAdapter, type StorePurchase } from './iap-adapter';
import {
  createPurchaseService,
  type PurchaseServiceDeps,
  type PurchaseUiState,
} from './purchase.service';

/* ── 고정 데이터 ── */

const PRO_PLAN: Plan = {
  planId: 'plan-pro',
  tier: 'pro',
  name: '프로',
  description: '',
  priceKrw: 9900,
  storeProductId: 'com.runtime.ear.subscription.pro.monthly',
  entitlements: { dailyPlayLimit: null, dailyDripCount: 2, dripEnabled: true, adsEnabled: false },
  action: 'purchase',
};

const INTENT: PurchaseIntent = {
  intentId: 'intent-1',
  storeProductId: PRO_PLAN.storeProductId as string,
  accountToken: 'intent-1',
};

const SUBSCRIBED: MySubscription = {
  plan: {
    status: 'subscribed',
    tier: 'pro',
    planName: '프로',
    dailyPlayLimit: null,
    renewsAt: '2026-11-06T03:00:00Z',
    expiresAt: null,
    hasPaymentIssue: false,
  },
  entitlements: { dailyPlayLimit: null, dailyDripCount: 2, dripEnabled: true, adsEnabled: false },
  store: 'app_store',
  pendingPlan: null,
};

const purchaseOf = (overrides: Partial<StorePurchase> = {}): StorePurchase => ({
  transactionId: 'tx-1',
  productId: INTENT.storeProductId,
  token: 'signed-jws',
  obfuscatedAccountId: null,
  state: 'purchased',
  raw: {},
  ...overrides,
});

const apiError = (code: string, retryable = false) =>
  new ApiError(code, code, retryable, null, null, 400);

/* ── 가짜 스토어·서버 ── */

const createHarness = (platform: PurchasePlatform = 'ios', supportsDeferredDowngrade = true) => {
  let updatedListener: ((purchase: StorePurchase) => void) | null = null;
  let errorListener: ((error: StoreError) => void) | null = null;
  const scheduled: { callback: () => void; delayMs: number; cancelled: boolean }[] = [];
  const uiStates: Partial<PurchaseUiState>[] = [];

  const adapter = {
    connect: jest.fn<IapAdapter['connect']>().mockResolvedValue(undefined),
    fetchSubscriptions: jest.fn<IapAdapter['fetchSubscriptions']>().mockResolvedValue([]),
    requestSubscription: jest
      .fn<IapAdapter['requestSubscription']>()
      .mockResolvedValue([purchaseOf()]),
    finish: jest.fn<IapAdapter['finish']>().mockResolvedValue(undefined),
    getUnfinished: jest.fn<IapAdapter['getUnfinished']>().mockResolvedValue([]),
    getActiveForRestore: jest.fn<IapAdapter['getActiveForRestore']>().mockResolvedValue([]),
    findReplaceable: jest.fn<IapAdapter['findReplaceable']>().mockResolvedValue(null),
    supportsDeferredDowngrade,
    resolvesDirectly: jest.fn<IapAdapter['resolvesDirectly']>().mockReturnValue(false),
    onPurchaseUpdated: jest.fn((listener: (purchase: StorePurchase) => void) => {
      updatedListener = listener;
      return () => {
        updatedListener = null;
      };
    }),
    onPurchaseError: jest.fn((listener: (error: StoreError) => void) => {
      errorListener = listener;
      return () => {
        errorListener = null;
      };
    }),
  } satisfies IapAdapter;

  const api = {
    createIntent: jest.fn<PurchaseServiceDeps['api']['createIntent']>().mockResolvedValue(INTENT),
    submit: jest.fn<PurchaseServiceDeps['api']['submit']>().mockResolvedValue(SUBSCRIBED),
    restore: jest
      .fn<PurchaseServiceDeps['api']['restore']>()
      .mockResolvedValue({ restored: true, subscription: SUBSCRIBED }),
  };

  const deps: PurchaseServiceDeps = {
    platform,
    adapter,
    api,
    onSubscriptionChanged: jest.fn(),
    onRecovered: jest.fn(),
    setUiState: (patch) => uiStates.push(patch),
    schedule: (callback, delayMs) => {
      const entry = { callback, delayMs, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  };

  const service = createPurchaseService(deps);
  return {
    service,
    adapter,
    api,
    deps,
    scheduled,
    uiStates,
    emitUpdated: (purchase: StorePurchase) => updatedListener?.(purchase),
    emitError: (error: StoreError) => errorListener?.(error),
    hasListeners: () => updatedListener !== null && errorListener !== null,
  };
};

/** 마이크로태스크를 비운다 — 리스너 경로의 제출이 끝날 때까지 */
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('PurchaseService', () => {
  let h: ReturnType<typeof createHarness>;

  beforeEach(() => {
    h = createHarness('ios');
  });

  describe('purchase — 결제 의도 → 결제 시트 → 서버 제출 → 거래 종료', () => {
    it('결제 의도의 account_token 을 결제에 실어 보내고, 서버 200 뒤에 거래를 끝낸다', async () => {
      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(h.api.createIntent).toHaveBeenCalledWith({
        planId: 'plan-pro',
        platform: 'ios',
        entryPoint: 'paywall',
      });
      expect(h.adapter.requestSubscription).toHaveBeenCalledWith({
        productId: INTENT.storeProductId,
        accountToken: 'intent-1',
      });
      expect(h.api.submit).toHaveBeenCalledWith({
        transaction: { platform: 'ios', signedTransaction: 'signed-jws' },
        intentId: 'intent-1',
      });
      expect(h.adapter.finish).toHaveBeenCalledTimes(1);
      expect(h.api.submit.mock.invocationCallOrder[0]).toBeLessThan(
        h.adapter.finish.mock.invocationCallOrder[0],
      );
      expect(outcome).toEqual({ kind: 'success', subscription: SUBSCRIBED });
      expect(h.deps.onSubscriptionChanged).toHaveBeenCalledWith(SUBSCRIBED);
    });

    it('결제가 끝나면 진행 단계가 idle 로 돌아온다', async () => {
      // when
      await h.service.purchase(PRO_PLAN, 'settings');

      // then
      expect(h.uiStates.filter((s) => s.phase !== undefined).map((s) => s.phase)).toEqual([
        'purchasing',
        'verifying',
        'idle',
      ]);
    });

    it('결제 시트를 닫으면 서버 제출도 거래 종료도 없이 cancelled 다', async () => {
      // given
      h.adapter.requestSubscription.mockRejectedValue(
        new StoreError('cancelled', 'user cancelled'),
      );

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(h.api.submit).not.toHaveBeenCalled();
      expect(h.adapter.finish).not.toHaveBeenCalled();
    });

    it('결제 승인 대기(Ask to Buy)면 서버에 보내지 않고 pending 이다', async () => {
      // given
      h.adapter.requestSubscription.mockRejectedValue(new StoreError('pending', 'deferred'));

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'pending' });
      expect(h.api.submit).not.toHaveBeenCalled();
    });

    it('스토어가 결제 대기 상태의 거래를 돌려주면 제출하지 않고 pending 이다', async () => {
      // given
      h.adapter.requestSubscription.mockResolvedValue([purchaseOf({ state: 'pending' })]);

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'pending' });
      expect(h.api.submit).not.toHaveBeenCalled();
      expect(h.adapter.finish).not.toHaveBeenCalled();
    });

    it('스토어가 이미 구독 중이라고 답하면 alreadyOwned 다', async () => {
      // given
      h.adapter.requestSubscription.mockRejectedValue(new StoreError('alreadyOwned', 'owned'));

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'settings');

      // then
      expect(outcome).toEqual({ kind: 'alreadyOwned' });
    });

    it('인증된 이메일이 없으면(EMAIL_REQUIRED_FOR_PURCHASE) 결제 시트를 열지 않는다', async () => {
      // given
      h.api.createIntent.mockRejectedValue(apiError(ERROR_CODES.EMAIL_REQUIRED_FOR_PURCHASE));

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'emailRequired' });
      expect(h.adapter.requestSubscription).not.toHaveBeenCalled();
    });

    it('다른 스토어에서 구독 중이면(SUBSCRIPTION_STORE_MISMATCH) 결제 시트를 열지 않고 storeMismatch 다', async () => {
      // given
      h.api.createIntent.mockRejectedValue(apiError(ERROR_CODES.SUBSCRIPTION_STORE_MISMATCH));

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'failed', reason: 'storeMismatch' });
      expect(h.adapter.requestSubscription).not.toHaveBeenCalled();
    });

    it('서버가 503(SUBSCRIPTION_STORE_UNAVAILABLE)이면 거래를 끝내지 않고 재시도를 예약한다', async () => {
      // given
      h.api.submit.mockRejectedValueOnce(
        apiError(ERROR_CODES.SUBSCRIPTION_STORE_UNAVAILABLE, true),
      );

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'delayed' });
      expect(h.adapter.finish).not.toHaveBeenCalled();
      expect(h.scheduled).toHaveLength(1);
      expect(h.scheduled[0].delayMs).toBe(SUBMIT_RETRY_DELAYS_MS[0]);
      expect(h.uiStates).toContainEqual({ isVerificationDelayed: true });
    });

    it('예약된 재시도가 성공하면 그때 거래를 끝내고 회복을 알린다', async () => {
      // given
      h.api.submit.mockRejectedValueOnce(apiError(ERROR_CODES.NETWORK_ERROR));
      await h.service.purchase(PRO_PLAN, 'paywall');

      // when
      h.scheduled[0].callback();
      await flush();

      // then
      expect(h.api.submit).toHaveBeenCalledTimes(2);
      expect(h.api.submit.mock.calls[1][0].intentId).toBe('intent-1');
      expect(h.adapter.finish).toHaveBeenCalledTimes(1);
      expect(h.deps.onRecovered).toHaveBeenCalledWith(SUBSCRIBED);
      expect(h.uiStates.at(-1)).toEqual({ isVerificationDelayed: false });
    });

    it('재시도가 또 실패하면 간격을 늘려 다시 예약한다 — 폐기하지 않는다', async () => {
      // given
      h.api.submit.mockRejectedValue(apiError(ERROR_CODES.TIMEOUT));
      await h.service.purchase(PRO_PLAN, 'paywall');

      // when
      h.scheduled[0].callback();
      await flush();

      // then
      expect(h.scheduled).toHaveLength(2);
      expect(h.scheduled[1].delayMs).toBe(SUBMIT_RETRY_DELAYS_MS[1]);
      expect(h.adapter.finish).not.toHaveBeenCalled();
    });

    it('영수증이 거부되면(SUBSCRIPTION_RECEIPT_INVALID) 거래를 끝내지 않고 자동 재시도하지 않는다', async () => {
      // given
      h.api.submit.mockRejectedValue(apiError(ERROR_CODES.SUBSCRIPTION_RECEIPT_INVALID));

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'failed', reason: 'receiptInvalid' });
      expect(h.adapter.finish).not.toHaveBeenCalled();
      expect(h.scheduled).toHaveLength(0);
    });

    it('다른 계정에 연결된 구독이면 ownedByAnotherAccount 이고 거래를 끝내지 않는다', async () => {
      // given
      h.api.submit.mockRejectedValue(apiError(ERROR_CODES.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT));

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'failed', reason: 'ownedByAnotherAccount' });
      expect(h.adapter.finish).not.toHaveBeenCalled();
    });

    it('결제 중에 또 누르면 두 번째는 busy 로 무시된다', async () => {
      // given
      let release!: (value: StorePurchase[]) => void;
      h.adapter.requestSubscription.mockReturnValue(
        new Promise<StorePurchase[]>((resolve) => {
          release = resolve;
        }),
      );
      const first = h.service.purchase(PRO_PLAN, 'paywall');
      await flush();

      // when
      const second = await h.service.purchase(PRO_PLAN, 'paywall');
      release([purchaseOf()]);

      // then
      expect(second).toEqual({ kind: 'busy' });
      expect(await first).toEqual({ kind: 'success', subscription: SUBSCRIBED });
      expect(h.api.createIntent).toHaveBeenCalledTimes(1);
    });

    it('결제 결과(반환값)와 리스너가 같은 거래를 들고 와도 서버에는 한 번만 보낸다', async () => {
      // given
      await h.service.start();
      h.adapter.requestSubscription.mockImplementation(async () => {
        h.emitUpdated(purchaseOf());
        return [purchaseOf()];
      });

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');
      await flush();

      // then
      expect(outcome.kind).toBe('success');
      expect(h.api.submit).toHaveBeenCalledTimes(1);
      expect(h.adapter.finish).toHaveBeenCalledTimes(1);
    });
  });

  describe('Android — 구매 확인은 서버가 한다', () => {
    beforeEach(() => {
      h = createHarness('android');
    });

    it('결과가 리스너로만 와도 구매 토큰·상품 ID 로 제출하고 obfuscatedAccountId 용 토큰을 싣는다', async () => {
      // given
      await h.service.start();
      h.adapter.requestSubscription.mockImplementation(async () => {
        setTimeout(() => h.emitUpdated(purchaseOf({ token: 'play-token' })), 0);
        return [];
      });

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(h.adapter.requestSubscription).toHaveBeenCalledWith({
        productId: INTENT.storeProductId,
        accountToken: 'intent-1',
      });
      expect(h.api.submit).toHaveBeenCalledWith({
        transaction: {
          platform: 'android',
          purchaseToken: 'play-token',
          productId: INTENT.storeProductId,
        } satisfies SubmittedTransaction,
        intentId: 'intent-1',
      });
      expect(outcome.kind).toBe('success');
    });

    it('취소가 오류 리스너로 오면 cancelled 로 끝난다', async () => {
      // given
      await h.service.start();
      h.adapter.requestSubscription.mockImplementation(async () => {
        setTimeout(() => h.emitError(new StoreError('cancelled', 'cancel')), 0);
        return [];
      });

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(h.api.submit).not.toHaveBeenCalled();
    });
  });

  describe('Android 요금제 변경 — 지금 구독을 교체한다(KAN-158)', () => {
    const CURRENT_DAILY = purchaseOf({
      transactionId: 'tx-daily',
      productId: 'com.runtime.ear.subscription.daily.monthly',
      token: 'daily-token',
      // Daily 를 살 때 실은 결제 의도 id — 교체 결제는 새 의도 id 가 아니라 이 값을 싣는다(Google 규칙)
      obfuscatedAccountId: 'intent-daily',
    });

    beforeEach(() => {
      h = createHarness('android');
    });

    const resolveByListener = () =>
      h.adapter.requestSubscription.mockImplementation(async () => {
        setTimeout(() => h.emitUpdated(purchaseOf({ token: 'play-token' })), 0);
        return [];
      });

    it('업그레이드는 지금 구독 토큰과 그 구독의 계정 id 를 넘겨 즉시 + 비례 정산으로 교체한다', async () => {
      // given
      await h.service.start();
      h.adapter.findReplaceable.mockResolvedValue(CURRENT_DAILY);
      resolveByListener();

      // when
      const outcome = await h.service.purchase(
        { ...PRO_PLAN, action: 'upgrade' },
        'settings',
        CURRENT_DAILY.productId,
      );

      // then
      expect(h.adapter.findReplaceable).toHaveBeenCalledWith(
        INTENT.storeProductId,
        CURRENT_DAILY.productId,
      );
      expect(h.adapter.requestSubscription).toHaveBeenCalledWith({
        productId: INTENT.storeProductId,
        accountToken: 'intent-1',
        replace: {
          purchaseToken: 'daily-token',
          oldProductId: CURRENT_DAILY.productId,
          accountToken: 'intent-daily',
          mode: 'chargeProrated',
        },
      });
      expect(outcome.kind).toBe('success');
    });

    it('다운그레이드는 다음 갱신부터(deferred)로 교체한다', async () => {
      // given
      await h.service.start();
      h.adapter.findReplaceable.mockResolvedValue(CURRENT_DAILY);
      resolveByListener();

      // when
      await h.service.purchase({ ...PRO_PLAN, action: 'downgrade' }, 'settings');

      // then
      expect(h.adapter.requestSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ replace: expect.objectContaining({ mode: 'deferred' }) }),
      );
    });

    it('다운그레이드를 예약할 수 없는 빌드(교체 모듈 없음)면 결제 의도도 시트도 없이 업데이트 안내다', async () => {
      // given
      h = createHarness('android', false);
      await h.service.start();

      // when
      const outcome = await h.service.purchase({ ...PRO_PLAN, action: 'downgrade' }, 'settings');

      // then
      expect(outcome).toEqual({ kind: 'failed', reason: 'downgradeNeedsUpdate' });
      expect(h.api.createIntent).not.toHaveBeenCalled();
      expect(h.adapter.requestSubscription).not.toHaveBeenCalled();
    });

    it('교체 모듈 경로에서 다음 갱신부터 교체가 옛 구독 구매를 돌려주면 그걸 제출해 끝낸다 — 리스너를 기다리지 않는다', async () => {
      // given — DEFERRED 는 대상(Daily)이 아니라 지금 구독(Pro)의 구매가 온다
      await h.service.start();
      h.adapter.findReplaceable.mockResolvedValue(CURRENT_DAILY);
      h.adapter.resolvesDirectly.mockReturnValue(true);
      const oldPro = purchaseOf({
        transactionId: 'tx-pro',
        productId: 'pro.old',
        token: 'pro-token',
      });
      h.adapter.requestSubscription.mockResolvedValue([oldPro]);

      // when
      const outcome = await h.service.purchase({ ...PRO_PLAN, action: 'downgrade' }, 'settings');

      // then
      expect(h.api.submit).toHaveBeenCalledWith(expect.objectContaining({ intentId: 'intent-1' }));
      expect(outcome.kind).toBe('success');
    });

    it('교체 모듈 경로가 빈 목록을 돌려주면 로딩을 끝내고 delayed 다', async () => {
      // given
      await h.service.start();
      h.adapter.findReplaceable.mockResolvedValue(CURRENT_DAILY);
      h.adapter.resolvesDirectly.mockReturnValue(true);
      h.adapter.requestSubscription.mockResolvedValue([]);

      // when
      const outcome = await h.service.purchase({ ...PRO_PLAN, action: 'downgrade' }, 'settings');

      // then
      expect(outcome).toEqual({ kind: 'delayed' });
      expect(h.api.submit).not.toHaveBeenCalled();
    });

    it('이미 다음 갱신부터 교체가 예약돼 있으면 downgradeAlreadyScheduled 다', async () => {
      // given
      await h.service.start();
      h.adapter.findReplaceable.mockResolvedValue(CURRENT_DAILY);
      h.adapter.requestSubscription.mockRejectedValue(
        new StoreError(
          'rejected',
          '5: There is an existing deferred replacement for the old product',
        ),
      );

      // when
      const outcome = await h.service.purchase({ ...PRO_PLAN, action: 'downgrade' }, 'settings');

      // then
      expect(outcome).toMatchObject({ kind: 'failed', reason: 'downgradeAlreadyScheduled' });
    });

    it('스토어가 교체를 거절하면(DEVELOPER_ERROR) changeRejected 이고 원문을 detail 로 싣는다', async () => {
      // given
      await h.service.start();
      h.adapter.findReplaceable.mockResolvedValue(CURRENT_DAILY);
      h.adapter.requestSubscription.mockRejectedValue(
        new StoreError('rejected', "5: Account identifiers don't match"),
      );

      // when
      const outcome = await h.service.purchase({ ...PRO_PLAN, action: 'upgrade' }, 'settings');

      // then
      expect(outcome).toEqual({
        kind: 'failed',
        reason: 'changeRejected',
        detail: "5: Account identifiers don't match",
      });
    });

    it('바꿀 지금 구독이 기기에 없으면 결제 시트를 열지 않는다 — 두 번째 구독을 만들지 않는다', async () => {
      // given
      await h.service.start();
      h.adapter.findReplaceable.mockResolvedValue(null);

      // when
      const outcome = await h.service.purchase({ ...PRO_PLAN, action: 'upgrade' }, 'settings');

      // then
      expect(outcome).toEqual({ kind: 'failed', reason: 'replaceSourceMissing' });
      expect(h.adapter.requestSubscription).not.toHaveBeenCalled();
    });

    it('새 구독(purchase)은 교체 없이 결제한다', async () => {
      // given
      await h.service.start();
      resolveByListener();

      // when
      await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(h.adapter.findReplaceable).not.toHaveBeenCalled();
      expect(h.adapter.requestSubscription.mock.calls[0][0].replace).toBeUndefined();
    });

    it('서버가 두 번째 구독(SUBSCRIPTION_ALREADY_SUBSCRIBED)으로 거부하면 alreadySubscribed 다 — "결제 실패"가 아니다', async () => {
      // given
      await h.service.start();
      resolveByListener();
      h.api.submit.mockRejectedValue(apiError(ERROR_CODES.SUBSCRIPTION_ALREADY_SUBSCRIBED));

      // when
      const outcome = await h.service.purchase(PRO_PLAN, 'paywall');

      // then
      expect(outcome).toEqual({ kind: 'failed', reason: 'alreadySubscribed' });
      expect(h.adapter.finish).not.toHaveBeenCalled();
    });

    it('iOS 는 요금제 변경이어도 교체 입력을 만들지 않는다 — 구독 그룹이 바꾼다', async () => {
      // given
      h = createHarness('ios');

      // when
      await h.service.purchase({ ...PRO_PLAN, action: 'upgrade' }, 'settings');

      // then
      expect(h.adapter.findReplaceable).not.toHaveBeenCalled();
      expect(h.adapter.requestSubscription.mock.calls[0][0].replace).toBeUndefined();
    });
  });

  describe('start · recoverUnfinished — 미완료 거래 회복', () => {
    it('시작하면 스토어에 연결하고 리스너를 건 뒤 미완료 거래를 intent_id 없이 제출한다', async () => {
      // given
      h.adapter.getUnfinished.mockResolvedValue([purchaseOf({ transactionId: 'tx-left' })]);

      // when
      await h.service.start();

      // then
      expect(h.adapter.connect).toHaveBeenCalledTimes(1);
      expect(h.hasListeners()).toBe(true);
      expect(h.api.submit).toHaveBeenCalledWith({
        transaction: { platform: 'ios', signedTransaction: 'signed-jws' },
        intentId: null,
      });
      expect(h.adapter.finish).toHaveBeenCalledTimes(1);
      expect(h.deps.onRecovered).toHaveBeenCalledWith(SUBSCRIBED);
    });

    it('결제 대기 상태의 미완료 거래는 제출하지 않는다', async () => {
      // given
      h.adapter.getUnfinished.mockResolvedValue([purchaseOf({ state: 'pending' })]);

      // when
      await h.service.start();

      // then
      expect(h.api.submit).not.toHaveBeenCalled();
    });

    it('스토어 연결이 실패하면 리스너를 걸지 않고 조용히 끝난다', async () => {
      // given
      h.adapter.connect.mockRejectedValue(new StoreError('unavailable', 'no store'));

      // when
      await h.service.start();

      // then
      expect(h.hasListeners()).toBe(false);
      expect(h.adapter.getUnfinished).not.toHaveBeenCalled();
    });

    it('시작 전(로그아웃 상태)에는 미완료 거래를 제출하지 않는다', async () => {
      // given
      h.adapter.getUnfinished.mockResolvedValue([purchaseOf()]);

      // when
      await h.service.recoverUnfinished();

      // then
      expect(h.api.submit).not.toHaveBeenCalled();
    });

    it('stop 하면 예약된 재시도를 취소하고 리스너를 뗀다', async () => {
      // given
      h.api.submit.mockRejectedValueOnce(apiError(ERROR_CODES.NETWORK_ERROR));
      h.adapter.getUnfinished.mockResolvedValue([purchaseOf()]);
      await h.service.start();

      // when
      h.service.stop();

      // then
      expect(h.scheduled[0].cancelled).toBe(true);
      expect(h.hasListeners()).toBe(false);
      expect(h.uiStates.at(-1)).toEqual({ phase: 'idle', isVerificationDelayed: false });
    });
  });

  describe('restore — 구매 복원', () => {
    it('스토어의 유효 거래를 모아 보내고 restored 면 구독을 확정한다', async () => {
      // given
      h.adapter.getActiveForRestore.mockResolvedValue([
        purchaseOf({ transactionId: 'a', token: 'jws-a' }),
        purchaseOf({ transactionId: 'b', token: 'jws-b', state: 'pending' }),
      ]);

      // when
      const outcome = await h.service.restore();

      // then
      expect(h.api.restore).toHaveBeenCalledWith({
        platform: 'ios',
        transactions: [{ platform: 'ios', signedTransaction: 'jws-a' }],
      });
      expect(outcome).toEqual({ kind: 'restored', subscription: SUBSCRIBED });
      expect(h.deps.onSubscriptionChanged).toHaveBeenCalledWith(SUBSCRIBED);
    });

    it('스토어에 유효한 구독이 없어도 빈 배열로 요청하고 nothingToRestore 다', async () => {
      // given
      h.api.restore.mockResolvedValue({ restored: false, subscription: SUBSCRIBED });

      // when
      const outcome = await h.service.restore();

      // then
      expect(h.api.restore).toHaveBeenCalledWith({ platform: 'ios', transactions: [] });
      expect(outcome.kind).toBe('nothingToRestore');
    });

    it('다른 계정에 연결된 구독이면 ownedByAnotherAccount 다', async () => {
      // given
      h.api.restore.mockRejectedValue(apiError(ERROR_CODES.SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT));

      // when
      const outcome = await h.service.restore();

      // then
      expect(outcome).toEqual({ kind: 'failed', reason: 'ownedByAnotherAccount' });
    });

    it('복원 요청은 최대 10건만 보낸다', async () => {
      // given
      h.adapter.getActiveForRestore.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) =>
          purchaseOf({ transactionId: `t${i}`, token: `j${i}` }),
        ),
      );

      // when
      await h.service.restore();

      // then
      expect(h.api.restore.mock.calls[0][0].transactions).toHaveLength(10);
    });
  });
});
