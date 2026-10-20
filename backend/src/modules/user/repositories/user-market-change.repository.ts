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

  /**
   * `since` 이후 전환 중 하루 1회에 세는 것 — 되돌리기(`is_revert`)는 쿨다운에서 뺀다(`global-api.md` 4.11). 어제 바꾼 것을
   * 오늘 되돌린 사용자가 오늘의 1회를 잃지 않게.
   */
  async countNonRevertByUserIdSince(
    userId: string,
    since: Date,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({
      userId,
      isRevert: false,
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
