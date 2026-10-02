import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { StoreNotificationLog } from '../entities/store-notification-log.entity';
import {
  StoreNotificationLogDraft,
  StoreNotificationLogRepository,
} from '../repositories/store-notification-log.repository';

/** `store_notification_logs`(domain.md 8.4) — 스토어 서버 알림의 중복 차단과 재처리 근거 */
@Injectable()
export class StoreNotificationLogService {
  constructor(
    private readonly storeNotificationLogRepository: StoreNotificationLogRepository,
  ) {}

  /**
   * 알림을 적재하고 그 행을 돌려준다. 이미 받은 알림이면 **기존 행**을 돌려준다 —
   * 호출부가 `processedAt`으로 "처리까지 끝난 재전송"과 "받기만 하고 처리에 실패했던 것"을 가른다.
   */
  async record(
    draft: StoreNotificationLogDraft,
  ): Promise<StoreNotificationLog> {
    await this.storeNotificationLogRepository.insertIfAbsent(draft);

    const log = await this.storeNotificationLogRepository.findByNotificationId(
      draft.store,
      draft.notificationId,
    );

    if (!log) {
      // 방금 넣었거나 이미 있던 행이다 — 없을 수 없다
      throw new Error('store notification log disappeared after insert');
    }

    return log;
  }

  async markProcessed(
    id: string,
    processedAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.storeNotificationLogRepository.markProcessed(
      id,
      processedAt,
      manager,
    );
  }
}
