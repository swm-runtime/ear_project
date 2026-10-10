import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { StoreNotificationLogService } from '@/modules/subscription/services/store-notification-log.service';
import { SubscriptionStore } from '@/modules/subscription/subscription.enum';

import {
  AppStoreGateway,
  AppStoreNotification,
  AppStoreVerificationError,
} from '../app-store/app-store.gateway';
import { BillingSyncService } from './billing-sync.service';
import { BillingAlertService } from './billing-alert.service';

/**
 * App Store Server Notifications V2 수신(`subscription-api.md` 4.6) — 갱신·해지·환불·유예의 **진실의 원천**.
 *
 * 응답 규칙이 곧 재시도 규칙이다: Apple은 2xx가 아니면 다시 보낸다. 그래서
 * - 서명이 틀리면 400(다시 와도 같다),
 * - 처리 중 실패하면 5xx(다시 받아야 한다),
 * - 처리를 끝냈거나 이미 처리한 알림이면 200이다.
 */
@Injectable()
export class AppStoreWebhookService {
  private readonly logger = new Logger(AppStoreWebhookService.name);

  constructor(
    private readonly appStoreGateway: AppStoreGateway,
    private readonly storeNotificationLogService: StoreNotificationLogService,
    private readonly billingSyncService: BillingSyncService,
    private readonly dataSource: DataSource,
    private readonly billingAlertService: BillingAlertService,
  ) {}

  async handle(signedPayload: string, now: Date): Promise<void> {
    const notification = await this.verify(signedPayload);

    // 처리보다 먼저, 트랜잭션 밖에서 적재한다 — 처리가 실패해 롤백돼도 "받았다"는 기록은 남는다(domain.md 8.4)
    const log = await this.storeNotificationLogService.record({
      store: SubscriptionStore.APP_STORE,
      notificationId: notification.id,
      type: notification.subtype
        ? `${notification.type}:${notification.subtype}`
        : notification.type,
      payload: toLogPayload(notification),
    });

    // 처리까지 끝난 알림의 재전송. 받기만 하고 처리에 실패했던 알림(`processed_at` 없음)은 다시 처리한다
    if (log.processedAt !== null) {
      return;
    }

    const outcome = await this.dataSource.transaction(async (manager) => {
      const result = await this.billingSyncService.applyNotification(
        notification,
        now,
        manager,
      );

      if (result.kind === 'unlinked') {
        // 어느 계정의 구독인지 모른다 — 처리 완료로 표시하지 않는다. 이후 영수증 제출·복원이 연결한다
        return result;
      }

      const userId = await this.findUserId(notification, manager);

      if (userId !== null) {
        // 위 반영이 구독 상태를 판정한 시각으로 지급도 판정한다 — 새로 시계를 읽지 않는다
        await this.billingSyncService.syncUserTier(userId, manager, now);
      }

      await this.storeNotificationLogService.markProcessed(
        log.id,
        now,
        manager,
      );

      return result;
    });

    this.logger.log('app store notification handled', {
      notification_id: notification.id,
      type: notification.type,
      subtype: notification.subtype,
      environment: notification.environment,
      original_transaction_id:
        notification.transaction?.originalTransactionId ?? null,
      outcome: outcome.kind,
      reason: outcome.kind === 'ignored' ? outcome.reason : null,
    });
  }

  private async verify(signedPayload: string): Promise<AppStoreNotification> {
    try {
      return await this.appStoreGateway.verifyNotification(signedPayload);
    } catch (error) {
      if (!(error instanceof AppStoreVerificationError)) {
        throw error;
      }

      this.logger.warn('app store notification rejected', {
        kind: error.kind,
        reason: error.reason,
      });
      this.billingAlertService.notificationRejected(
        SubscriptionStore.APP_STORE,
        error.kind,
        error.reason,
      );

      throw error.kind === 'unavailable'
        ? new BusinessException({
            status: HttpStatus.SERVICE_UNAVAILABLE,
            errorCode: ErrorCode.SUBSCRIPTION_STORE_UNAVAILABLE,
            message: '알림을 검증하지 못했어요',
            retryable: true,
          })
        : new BusinessException({
            status: HttpStatus.BAD_REQUEST,
            errorCode: ErrorCode.SUBSCRIPTION_RECEIPT_INVALID,
            message: '알림을 검증하지 못했어요',
            logLevel: 'info',
          });
    }
  }

  /** 방금 반영한 구독의 주인 — 티어 캐시를 맞출 대상 */
  private async findUserId(
    notification: AppStoreNotification,
    manager: EntityManager,
  ): Promise<string | null> {
    if (notification.transaction === null) {
      return null;
    }

    return this.billingSyncService.findSubscriptionOwner(
      notification.transaction.originalTransactionId,
      manager,
    );
  }
}

/**
 * 적재할 값 — **검증을 마친 뒤 풀어낸 필드만**이고 서명 원문(JWS)은 넣지 않는다(domain.md 8.4).
 * 재처리와 "그때 무슨 알림이 왔는가"를 보기에 충분한 만큼만 둔다.
 */
function toLogPayload(
  notification: AppStoreNotification,
): Record<string, unknown> {
  const { transaction, renewal } = notification;

  return {
    notification_type: notification.type,
    subtype: notification.subtype,
    signed_at: notification.signedAt.toISOString(),
    environment: notification.environment,
    transaction:
      transaction === null
        ? null
        : {
            original_transaction_id: transaction.originalTransactionId,
            product_id: transaction.productId,
            purchased_at: transaction.purchasedAt.toISOString(),
            expires_at: transaction.expiresAt.toISOString(),
            revoked_at: transaction.revokedAt?.toISOString() ?? null,
            // 토큰 값 자체는 싣지 않는다 — 결제 의도의 id라 살아 있는 계정을 가리킨다(탈퇴 뒤에도 남는 표다)
            has_account_token: transaction.accountToken !== null,
          },
    renewal:
      renewal === null
        ? null
        : {
            is_auto_renew: renewal.isAutoRenew,
            auto_renew_product_id: renewal.autoRenewProductId,
            grace_period_expires_at:
              renewal.gracePeriodExpiresAt?.toISOString() ?? null,
          },
  };
}
