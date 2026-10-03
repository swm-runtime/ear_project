import { createHash } from 'crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { StoreNotificationLogService } from '@/modules/subscription/services/store-notification-log.service';
import { SubscriptionStore } from '@/modules/subscription/subscription.enum';

import { receiptInvalid, storeUnavailable } from '../billing.exception';
import {
  PlayNotification,
  PlayPushEnvelope,
  PlayStoreError,
  PlayStoreGateway,
} from '../play-store/play-store.gateway';
import { PlayPurchaseService } from './play-purchase.service';

/**
 * Google Play 실시간 개발자 알림(RTDN) 수신(`subscription-api.md` 4.7). Google Cloud Pub/Sub의 push 구독이
 * 호출한다.
 *
 * 응답 규칙이 곧 재전송 규칙이다(App Store 웹훅과 같다): 2xx가 아니면 Pub/Sub이 다시 보낸다. 그래서 처리를
 * 끝냈거나 이미 처리한 알림만 200이고, Google 조회·구매 확인이 실패하면 5xx로 답해 다시 받는다.
 *
 * **처리 완료 표시는 구매 확인(acknowledge)까지 끝난 뒤에 한다.** 반영만 하고 완료로 표시하면, 확인이 실패했을 때
 * 재전송된 알림이 "이미 처리함"으로 걸러져 그 구매를 다시 확인할 기회가 없다 — 3일 뒤 Google이 환불한다.
 */
@Injectable()
export class PlayStoreWebhookService {
  private readonly logger = new Logger(PlayStoreWebhookService.name);

  constructor(
    private readonly playStoreGateway: PlayStoreGateway,
    private readonly playPurchaseService: PlayPurchaseService,
    private readonly storeNotificationLogService: StoreNotificationLogService,
  ) {}

  async handle(
    authorization: string | undefined,
    body: unknown,
    now: Date,
  ): Promise<void> {
    const envelope = parseEnvelope(body);

    if (envelope === null) {
      throw new BusinessException({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_FAILED,
        message: '알림 형식을 확인해주세요',
        logLevel: 'info',
      });
    }

    const notification = await this.verify(authorization, envelope);

    // 처리보다 먼저 적재한다 — 처리가 실패해도 "받았다"는 기록은 남는다(domain.md 8.4)
    const log = await this.storeNotificationLogService.record({
      store: SubscriptionStore.PLAY_STORE,
      notificationId: notification.id,
      type: toTypeLabel(notification),
      payload: toLogPayload(notification),
    });

    if (log.processedAt !== null) {
      return;
    }

    // Google 조회·구매 확인이 실패하면 여기서 503이 나가고, 완료 표시 없이 Pub/Sub의 재전송을 기다린다
    const outcome = await this.playPurchaseService.applyNotification(
      notification,
      now,
    );

    // 어느 계정의 구독인지 모르는 알림은 완료로 두지 않는다 — 이후 영수증 제출·복원이 연결한다
    if (outcome.kind !== 'unlinked') {
      await this.storeNotificationLogService.markProcessed(log.id, now);
    }

    this.logger.log('play store notification handled', {
      notification_id: notification.id,
      kind: notification.kind,
      type: notification.type,
      outcome: outcome.kind,
      reason: outcome.kind === 'ignored' ? outcome.reason : null,
    });
  }

  private async verify(
    authorization: string | undefined,
    envelope: PlayPushEnvelope,
  ): Promise<PlayNotification> {
    try {
      return await this.playStoreGateway.verifyNotification(
        authorization,
        envelope,
      );
    } catch (error) {
      if (!(error instanceof PlayStoreError)) {
        throw error;
      }

      this.logger.warn('play store notification rejected', {
        kind: error.kind,
        reason: error.reason,
      });

      throw error.kind === 'unavailable'
        ? storeUnavailable()
        : receiptInvalid();
    }
  }
}

/**
 * Pub/Sub push 본문에서 우리가 쓰는 부분만 꺼낸다. 형식이 다르면 `null`.
 *
 * DTO 클래스로 받지 않는다 — Pub/Sub은 같은 값을 두 표기(`messageId`·`message_id`)로 함께 보내고 `attributes`·
 * `deliveryAttempt` 같은 필드를 더 실어, 전역 검증의 "모르는 필드 거부"에 걸린다. 받는 쪽이 Google이 보내는
 * 필드 목록을 따라갈 이유가 없으므로 필요한 두 값만 확인한다.
 */
function parseEnvelope(body: unknown): PlayPushEnvelope | null {
  const message = (body as { message?: Record<string, unknown> } | null)
    ?.message;
  const data = message?.data;
  const messageId = message?.messageId ?? message?.message_id;

  if (
    typeof data !== 'string' ||
    data === '' ||
    typeof messageId !== 'string' ||
    messageId === ''
  ) {
    return null;
  }

  return { message: { data, messageId } };
}

function toTypeLabel(notification: PlayNotification): string {
  switch (notification.kind) {
    case 'subscription':
      return `SUBSCRIPTION:${notification.type ?? 'UNKNOWN'}`;
    case 'voided':
      return 'VOIDED_PURCHASE';
    case 'test':
      return 'TEST';
    case 'other':
      return 'OTHER';
  }
}

/**
 * 적재할 값. **구매 토큰 원문은 넣지 않는다** — 그 토큰만 있으면 Google에 그 구매를 조회할 수 있는 열쇠다
 * (domain.md 8.4 · `convention.md` 8.4). 같은 구독의 알림끼리 묶어 볼 수 있게 해시만 남긴다.
 */
function toLogPayload(notification: PlayNotification): Record<string, unknown> {
  return {
    kind: notification.kind,
    notification_type: notification.type,
    event_at: notification.eventAt.toISOString(),
    purchase_token_sha256:
      notification.purchaseToken === null
        ? null
        : createHash('sha256').update(notification.purchaseToken).digest('hex'),
  };
}
