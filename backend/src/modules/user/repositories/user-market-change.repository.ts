import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThanOrEqual, Repository } from 'typeorm';

import { UserMarketChange } from '../entities/user-market-change.entity';

@Injectable()
export class UserMarketChangeRepository {
  constructor(
    @InjectRepository(UserMarketChange)
    private readonly repository: Repository<UserMarketChange>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserMarketChange> {
    return manager ? manager.getRepository(UserMarketChange) : this.repository;
  }

  /** 가장 최근 전환 — 되돌리기 판정의 "직전 시장"이다 */
  async findLatestByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserMarketChange | null> {
    return this.scoped(manager).findOne({
      where: { userId },
      order: { changedAt: 'DESC' },
    });
  }

  async countByUserIdSince(
    userId: string,
    since: Date,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({
      userId,
      changedAt: MoreThanOrEqual(since),
    });
  }

  create(change: Partial<UserMarketChange>): UserMarketChange {
    return this.repository.create(change);
  }

  async save(
    change: UserMarketChange,
    manager?: EntityManager,
  ): Promise<UserMarketChange> {
    return this.scoped(manager).save(change);
  }
}
