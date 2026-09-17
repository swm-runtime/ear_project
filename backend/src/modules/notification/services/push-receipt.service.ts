import { Injectable, Logger } from '@nestjs/common';

import { DeviceTokenService } from '@/modules/user/services/device-token.service';

import {
  EXPO_DEVICE_NOT_REGISTERED,
  EXPO_PUSH_RECEIPT_CHUNK_SIZE,
  PUSH_RECEIPT_CHECK_DELAY_MS,
  PUSH_RECEIPT_MAX_AGE_MS,
  PUSH_RECEIPT_MAX_PENDING,
} from '../notification.constant';
import { PushClient } from '../push/push.client';

interface PendingReceipt {
  ticketId: string;
  deviceTokenId: string;
  /** 보낸 토큰 — 그사이 같은 행에 새 토큰이 등록됐으면 끄지 않기 위해 함께 든다 */
  token: string;
  sentAt: Date;
}

/**
 * 발송 뒤 **receipt로만 드러나는** 무효 토큰을 정리한다(`notification.md` 7 — Expo는 접수(ticket)와
 * 전달 결과(receipt)가 분리돼 있고, 앱 삭제 같은 사유는 receipt에서 `DeviceNotRegistered`로 온다).
 *
 * **대기 목록은 메모리에 둔다.** `notification_logs`는 사용자 단위 1행이라 기기별 ticket id를 담을
 * 컬럼이 없고(domain.md 9.1), 이 목록을 잃어도(재기동) 손해는 "무효 토큰을 하루 늦게 안다"뿐이다 —
 * 다음 발송에서 같은 토큰은 ticket 단계 오류로 다시 잡히거나 receipt 대기에 다시 들어온다.
 * 알림이 잘못 가는 일은 생기지 않는다.
 */
@Injectable()
export class PushReceiptService {
  private readonly logger = new Logger(PushReceiptService.name);
  private pending: PendingReceipt[] = [];

  constructor(
    private readonly pushClient: PushClient,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  track(
    entries: { ticketId: string; deviceTokenId: string; token: string }[],
    now: Date,
  ) {
    this.pending.push(...entries.map((entry) => ({ ...entry, sentAt: now })));

    if (this.pending.length > PUSH_RECEIPT_MAX_PENDING) {
      // 오래된 것부터 버린다 — 발송은 이미 끝났고 잃는 것은 토큰 정리 한 번이다
      this.pending = this.pending.slice(-PUSH_RECEIPT_MAX_PENDING);
    }
  }

  /** 발송 후 대기 시간이 지난 ticket의 receipt를 조회해 무효 토큰을 뺀다. 무효화한 기기 수를 돌려준다 */
  async checkDue(now: Date): Promise<number> {
    const dueBefore = now.getTime() - PUSH_RECEIPT_CHECK_DELAY_MS;
    const expiredBefore = now.getTime() - PUSH_RECEIPT_MAX_AGE_MS;
    // Expo가 이미 지운 receipt는 물어봐도 없다
    this.pending = this.pending.filter(
      (entry) => entry.sentAt.getTime() > expiredBefore,
    );
    const due = this.pending.filter(
      (entry) => entry.sentAt.getTime() <= dueBefore,
    );

    if (due.length === 0) {
      return 0;
    }

    const answered = new Set<string>();
    const invalidTokens: { id: string; token: string }[] = [];

    for (let i = 0; i < due.length; i += EXPO_PUSH_RECEIPT_CHUNK_SIZE) {
      const chunk = due.slice(i, i + EXPO_PUSH_RECEIPT_CHUNK_SIZE);
      const receipts = await this.pushClient.getReceipts(
        chunk.map((entry) => entry.ticketId),
      );

      for (const entry of chunk) {
        const receipt = receipts.get(entry.ticketId);

        if (!receipt) {
          // 아직 준비되지 않았다 — 만료 전까지 다음 주기에 다시 묻는다
          continue;
        }

        answered.add(entry.ticketId);

        if (
          receipt.status === 'error' &&
          receipt.error === EXPO_DEVICE_NOT_REGISTERED
        ) {
          invalidTokens.push({ id: entry.deviceTokenId, token: entry.token });
        }
      }
    }

    this.pending = this.pending.filter(
      (entry) => !answered.has(entry.ticketId),
    );

    const invalidated = await this.deviceTokenService.invalidateDeliveredTokens(
      invalidTokens,
      now,
    );

    if (answered.size > 0) {
      this.logger.log('push receipts checked', {
        checked_count: answered.size,
        invalidated_device_count: invalidated,
      });
    }

    return invalidated;
  }

  /** 테스트·운영 점검용 — 대기 중인 receipt 수 */
  pendingCount(): number {
    return this.pending.length;
  }
}
