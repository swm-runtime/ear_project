import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Subscription } from '../entities/subscription.entity';
import { LIVE_SUBSCRIPTION_STATUSES } from '../subscription.enum';

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

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
