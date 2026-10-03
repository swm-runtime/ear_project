import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThan, Repository } from 'typeorm';

import { Subscription } from '../entities/subscription.entity';
import {
  LIVE_SUBSCRIPTION_STATUSES,
  NON_TERMINAL_SUBSCRIPTION_STATUSES,
} from '../subscription.enum';

/** 새 구독 행을 만들 때 채우는 값 — `id`·타임스탬프는 DB가 채운다 */
export type SubscriptionDraft = Omit<
  Subscription,
  'id' | 'user' | 'createdAt' | 'updatedAt'
>;

/**
 * architecture.md 8.2 — 트랜잭션 컨텍스트는 마지막 인자로 명시적으로 전달받는다.
 * 전달되면 그것을, 아니면 기본 매니저를 쓴다.
 */
@Injectable()
export class SubscriptionRepository {
  constructor(
    @InjectRepository(Subscription)
    private readonly repository: Repository<Subscription>,
  ) {}

  private scoped(manager?: EntityManager): Repository<Subscription> {
    return manager ? manager.getRepository(Subscription) : this.repository;
  }

  /** domain.md 12.3 — status를 보지 않는다. refunded·expired도 거래기록이다 */
  async existsByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    return this.scoped(manager).existsBy({ userId });
  }

  async countLiveByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({
      userId,
      status: In([...LIVE_SUBSCRIPTION_STATUSES]),
    });
  }

  async findAllByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Subscription[]> {
    return this.scoped(manager).findBy({ userId });
  }

  /** 스토어 구독의 자연 키로 찾는다 — 한 스토어 구독은 한 행이다(`uq_subscriptions_original_transaction_id`) */
  async findByOriginalTransactionId(
    originalTransactionId: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    return this.scoped(manager).findOneBy({ originalTransactionId });
  }

  /**
   * 마지막으로 반영한 영수증(`latest_receipt`)으로 찾는다 — **Play 전용**이다.
   *
   * Play는 업·다운그레이드·재구독 때 새 구매 토큰을 발급하고, 그 응답이 "이전 토큰"(`linkedPurchaseToken`)을
   * 알려 준다. 이전 토큰은 그 구독의 최초 토큰(`original_transaction_id`)일 수도, 중간에 한 번 바뀐 토큰
   * (`latest_receipt`)일 수도 있어 둘 다로 찾는다(`subscription-api.md` 4.7). 인덱스가 없지만 구독 행은
   * 유료 사용자 수만큼이고, 토큰이 바뀌는 순간에만 부른다.
   */
  async findByLatestReceipt(
    store: Subscription['store'],
    latestReceipt: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    return this.scoped(manager).findOneBy({ store, latestReceipt });
  }

  /**
   * 반영 전에 행을 잠근다. 영수증 제출과 스토어 알림이 같은 구독을 동시에 건드릴 수 있어서다 —
   * 잠그지 않으면 늦게 커밋한 쪽이 먼저 읽은 옛 값으로 덮는다.
   */
  async findByOriginalTransactionIdForUpdate(
    originalTransactionId: string,
    manager: EntityManager,
  ): Promise<Subscription | null> {
    return manager.getRepository(Subscription).findOne({
      where: { originalTransactionId },
      // `FOR NO KEY UPDATE` — 직렬화 목적은 지키면서 FK 자식 삽입의 KEY SHARE와 충돌하지 않는다
      // (`UserRepository.findByIdForUpdate`와 같은 모드)
      lock: { mode: 'for_no_key_update' },
    });
  }

  /**
   * 행이 없을 때만 만든다. 동시에 도착한 두 요청 중 하나가 먼저 만들었으면 유니크 충돌을 삼키고
   * `false`를 돌려준다 — 호출부가 다시 잠가 읽어 그 행에 반영한다.
   */
  async insertIfAbsent(
    draft: SubscriptionDraft,
    manager: EntityManager,
  ): Promise<boolean> {
    const result = await manager
      .getRepository(Subscription)
      .createQueryBuilder()
      .insert()
      .values(draft)
      .orIgnore()
      .returning('id')
      .execute();

    // 충돌로 건너뛴 행은 RETURNING에 실리지 않는다 — 돌아온 행이 있으면 이번에 만든 것이다
    return (result.raw as unknown[]).length > 0;
  }

  async save(
    subscription: Subscription,
    manager?: EntityManager,
  ): Promise<Subscription> {
    return this.scoped(manager).save(subscription);
  }

  /**
   * 만료 보정 대상 — 비종결 상태인데 만료 시각이 `before`보다 과거인 행(`subscription-api.md` 4.2).
   * 스토어 알림이 유실되지 않았다면 생기지 않는 행이라 건수는 작다.
   */
  async findOverdue(
    before: Date,
    limit: number,
    manager?: EntityManager,
  ): Promise<Subscription[]> {
    return this.scoped(manager).find({
      where: {
        status: In([...NON_TERMINAL_SUBSCRIPTION_STATUSES]),
        expiresAt: LessThan(before),
      },
      order: { expiresAt: 'ASC' },
      take: limit,
    });
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
