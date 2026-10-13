import { PurchaseIntentService } from '@/modules/subscription/services/purchase-intent.service';

import { BillingAlertService } from './billing-alert.service';
import { SubscriptionReconcileScheduler } from './subscription-reconcile.scheduler';
import { SubscriptionReconcileService } from './subscription-reconcile.service';

describe('SubscriptionReconcileScheduler', () => {
  let reconcile: jest.Mocked<SubscriptionReconcileService>;
  let intents: jest.Mocked<PurchaseIntentService>;
  let alerts: jest.Mocked<BillingAlertService>;
  let scheduler: SubscriptionReconcileScheduler;

  beforeEach(() => {
    reconcile = {
      reconcileOverdue: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<SubscriptionReconcileService>;
    intents = {
      purgeAbandoned: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<PurchaseIntentService>;
    alerts = {
      reconcileFailed: jest.fn(),
    } as unknown as jest.Mocked<BillingAlertService>;
    scheduler = new SubscriptionReconcileScheduler(reconcile, intents, alerts);
  });

  it('만료 보정 뒤 버려진 결제 의도를 정리한다', async () => {
    await scheduler.run();

    expect(reconcile.reconcileOverdue).toHaveBeenCalledTimes(1);
    expect(intents.purgeAbandoned).toHaveBeenCalledTimes(1);
    expect(alerts.reconcileFailed).not.toHaveBeenCalled();
  });

  it('실패하면 던지지 않고 결제 알림을 보낸다 — 던지면 크론이 멈춘다', async () => {
    reconcile.reconcileOverdue.mockRejectedValue(new Error('store down'));

    await expect(scheduler.run()).resolves.toBeUndefined();
    expect(alerts.reconcileFailed).toHaveBeenCalledWith(
      expect.stringContaining('store down'),
    );
  });

  it('만료 보정이 실패하면 같은 실행의 결제 의도 정리도 건너뛴다(현재 동작 — 다음 날 다시 돈다)', async () => {
    reconcile.reconcileOverdue.mockRejectedValue(new Error('store down'));

    await scheduler.run();

    expect(intents.purgeAbandoned).not.toHaveBeenCalled();
  });
});
