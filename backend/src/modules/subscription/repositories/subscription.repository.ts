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

  /**
   * 화면에 표시할 **현재 구독 한 건** — 만료가 가장 늦은 행이다.
   *
   * `status`로 먼저 거르지 않는 이유는 `free` 판정이 "살아 있는 행이 없음"이기 때문이다
   * (`profile-api.md` 4.1 — 행 자체가 없거나 `expired` · `refunded`뿐이면 무료). 여기서
   * `active`만 걸러 오면 호출부가 "행이 없다"와 "만료된 행만 있다"를 구분할 수 없다.
   *
   * 정렬 키가 `expires_at`인 이유: 플랜을 갈아탄 사용자는 행이 여럿이고, 그중 지금 효력이
   * 있는 것은 가장 늦게 끝나는 행이다. 동률이면 나중에 시작한 것을 앞에 둔다.
   */
  async findLatestByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<Subscription | null> {
    return this.scoped(manager).findOne({
      where: { userId },
      order: { expiresAt: 'DESC', startedAt: 'DESC' },
    });
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
