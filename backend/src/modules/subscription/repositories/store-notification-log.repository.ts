import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryDeepPartialEntity, Repository } from 'typeorm';

import { StoreNotificationLog } from '../entities/store-notification-log.entity';
import { SubscriptionStore } from '../subscription.enum';

export type StoreNotificationLogDraft = Pick<
  StoreNotificationLog,
  'store' | 'notificationId' | 'type' | 'payload'
>;

@Injectable()
export class StoreNotificationLogRepository {
  constructor(
    @InjectRepository(StoreNotificationLog)
    private readonly repository: Repository<StoreNotificationLog>,
  ) {}

  private scoped(manager?: EntityManager): Repository<StoreNotificationLog> {
    return manager
      ? manager.getRepository(StoreNotificationLog)
      : this.repository;
  }

  /**
   * 알림 한 건을 적재한다. **`(store, notification_id)` 유니크 충돌은 실패가 아니다** — 스토어의 재전송이다
   * (domain.md 8.4). 충돌하면 아무것도 쓰지 않고 `false`를 돌려준다.
   */
  async insertIfAbsent(
    draft: StoreNotificationLogDraft,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.scoped(manager)
      .createQueryBuilder()
      .insert()
      // `payload`(jsonb)의 `unknown` 값이 TypeORM의 부분 엔티티 타입에 맞지 않는다 — 모양은 Draft가 보장한다
      .values(draft as QueryDeepPartialEntity<StoreNotificationLog>)
      .orIgnore()
      .returning('id')
      .execute();

    // 충돌로 건너뛴 행은 RETURNING에 실리지 않는다 — 돌아온 행이 있으면 이번에 적재한 것이다
    return (result.raw as unknown[]).length > 0;
  }

  async findByNotificationId(
    store: SubscriptionStore,
    notificationId: string,
    manager?: EntityManager,
  ): Promise<StoreNotificationLog | null> {
    return this.scoped(manager).findOneBy({ store, notificationId });
  }

  async markProcessed(
    id: string,
    processedAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update({ id }, { processedAt });
  }
}
