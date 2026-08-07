import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThanOrEqual, Repository } from 'typeorm';

import { UserSignalAction } from '../playback.enum';
import { UserSignal } from '../entities/user-signal.entity';

@Injectable()
export class UserSignalRepository {
  constructor(
    @InjectRepository(UserSignal)
    private readonly repository: Repository<UserSignal>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserSignal> {
    return manager ? manager.getRepository(UserSignal) : this.repository;
  }

  /**
   * 이력 테이블이라 **중복을 막지 않는다.** 같은 행동을 두 번 하면 두 행이 남는 것이
   * 맞다 — 최근성 가중(`drip-scheduling.md` 4.3)이 그 빈도를 읽는다.
   */
  async insert(
    signal: Partial<UserSignal>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).insert(signal);
  }

  /**
   * 최근 신호 목록. 탐색 추천 랭킹의 입력이다(FR-15 — `drip-scheduling.md` 4.3).
   *
   * **`idx_user_signals_user_id_created_at`이 이 조회의 경로다**(domain.md 6.4).
   * 상한을 두는 이유는 신호가 사용자당 무한히 쌓이는 이력 테이블이기 때문이다 — 랭킹은
   * 최근 취향을 보는 것이라 오래된 꼬리까지 읽을 이유가 없다.
   */
  async findAllRecentByUserId(
    userId: string,
    since: Date,
    limit: number,
    manager?: EntityManager,
  ): Promise<UserSignal[]> {
    return this.scoped(manager).find({
      where: { userId, createdAt: MoreThanOrEqual(since) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** 콜드스타트 판정용(FR-17) — 완청 신호가 몇 건 쌓였는가 */
  async countByUserIdAndAction(
    userId: string,
    action: UserSignalAction,
    manager?: EntityManager,
  ): Promise<number> {
    return this.scoped(manager).countBy({ userId, action });
  }
}
